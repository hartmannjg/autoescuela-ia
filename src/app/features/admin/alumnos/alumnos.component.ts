import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { User } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-alumnos',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatChipsModule, MatTableModule, MatSortModule, MatTooltipModule, FechaHoraPipe],
  templateUrl: './alumnos.component.html',
  styleUrl: './alumnos.component.scss',
})
export class AlumnosComponent {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtro = signal('');
  readonly filtroBloqueado = signal<boolean | null>(null);

  readonly alumnos = toSignal(this.usuarioService.alumnosPorSucursal$(this.sucursalId), { initialValue: [] as User[] });

  readonly alumnosFiltrados = computed(() => {
    const f = this.filtro().toLowerCase();
    return this.alumnos().filter(a => {
      const matchNombre = a.nombre.toLowerCase().includes(f) || a.email.toLowerCase().includes(f);
      const matchBloqueado = this.filtroBloqueado() === null || a.alumnoData?.bloqueado === this.filtroBloqueado();
      return matchNombre && matchBloqueado;
    });
  });

  readonly columnas = ['nombre', 'email', 'plan', 'saldo', 'estado', 'acciones'];

  getSaldoTotal(alumno: User): number {
    return (alumno.alumnoData?.planContratado?.clasesRestantes ?? 0) + (alumno.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0);
  }

  async toggleBloqueo(alumno: User): Promise<void> {
    const bloqueado = alumno.alumnoData?.bloqueado;
    if (bloqueado) {
      const r = await Swal.fire({ title: '¿Desbloquear alumno?', text: alumno.nombre, icon: 'question', showCancelButton: true, confirmButtonText: 'Desbloquear', confirmButtonColor: '#2e7d32' });
      if (r.isConfirmed) await this.usuarioService.desbloquearAlumno(alumno.uid);
    } else {
      const { value: motivo } = await Swal.fire({ title: 'Bloquear alumno', input: 'textarea', inputLabel: 'Motivo del bloqueo', showCancelButton: true, confirmButtonText: 'Bloquear', confirmButtonColor: '#c62828', inputValidator: v => !v ? 'El motivo es requerido' : undefined });
      if (motivo) await this.usuarioService.bloquearAlumno(alumno.uid, motivo);
    }
  }

  async recargarCredito(alumno: User): Promise<void> {
    const { value: cant } = await Swal.fire({ title: 'Recargar crédito', input: 'number', inputLabel: 'Cantidad de clases a agregar', inputAttributes: { min: '1', max: '50' }, showCancelButton: true, confirmButtonText: 'Recargar', confirmButtonColor: '#1a237e' });
    if (cant) await this.usuarioService.recargarCredito(alumno.uid, Number(cant));
  }
}

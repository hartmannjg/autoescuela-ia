import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { UsuarioService } from '../../../core/services/usuario.service';
import { TurnoService } from '../../../core/services/turno.service';
import { User, Turno } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
@Component({
  selector: 'app-alumno-detalle',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatTabsModule, MatChipsModule, MatProgressBarModule, MatDividerModule, MatProgressSpinnerModule, FechaHoraPipe, EstadoTurnoPipe],
  templateUrl: './alumno-detalle.component.html',
  styleUrl: './alumno-detalle.component.scss',
})
export class AlumnoDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private usuarioService = inject(UsuarioService);
  private turnoService = inject(TurnoService);

  readonly alumno = signal<User | null>(null);
  readonly loading = signal(true);
  readonly uid = signal('');

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.uid.set(id);
    const u = await this.usuarioService.getByIdOnce(id);
    this.alumno.set(u);
    this.loading.set(false);
  }

  readonly turnos = toSignal(
    this.turnoService.turnosAlumno$(this.route.snapshot.paramMap.get('id') ?? ''),
    { initialValue: [] as Turno[] }
  );

  getSaldoTotal(): number {
    const a = this.alumno();
    return (a?.alumnoData?.planContratado?.clasesRestantes ?? 0) + (a?.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0);
  }

  async toggleBloqueo(): Promise<void> {
    const a = this.alumno();
    if (!a) return;
    if (a.alumnoData?.bloqueado) {
      await this.usuarioService.desbloquearAlumno(a.uid);
      Swal.fire({ icon: 'success', title: 'Alumno desbloqueado', confirmButtonColor: '#1a237e' });
    } else {
      const { value: motivo } = await Swal.fire({ title: 'Bloquear alumno', input: 'textarea', inputLabel: 'Motivo', showCancelButton: true, confirmButtonText: 'Bloquear', confirmButtonColor: '#c62828', inputValidator: v => !v ? 'Requerido' : undefined });
      if (motivo) {
        await this.usuarioService.bloquearAlumno(a.uid, motivo);
        Swal.fire({ icon: 'success', title: 'Alumno bloqueado', confirmButtonColor: '#1a237e' });
      }
    }
    const updated = await this.usuarioService.getByIdOnce(a.uid);
    this.alumno.set(updated);
  }

  async recargarCredito(): Promise<void> {
    const { value: cant } = await Swal.fire({ title: 'Recargar crédito', input: 'number', inputLabel: 'Clases a agregar', showCancelButton: true, confirmButtonText: 'Recargar', confirmButtonColor: '#1a237e' });
    if (cant) {
      await this.usuarioService.recargarCredito(this.alumno()!.uid, Number(cant));
      const updated = await this.usuarioService.getByIdOnce(this.alumno()!.uid);
      this.alumno.set(updated);
    }
  }
}

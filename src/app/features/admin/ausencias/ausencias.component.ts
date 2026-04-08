import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { AusenciaService } from '../../../core/services/ausencia.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { InstructorAusencia, EstadoAusencia, User } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-ausencias',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatSelectModule, MatDividerModule, MatTooltipModule, FechaHoraPipe,
  ],
  templateUrl: './ausencias.component.html',
  styleUrl: './ausencias.component.scss',
})
export class AusenciasComponent {
  private authService = inject(AuthService);
  private ausenciaService = inject(AusenciaService);
  private usuarioService = inject(UsuarioService);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtroEstado = signal<EstadoAusencia | 'todos'>('todos');

  readonly ausencias = toSignal(
    this.ausenciaService.ausenciasPorSucursal$(this.sucursalId),
    { initialValue: [] as InstructorAusencia[] }
  );

  readonly instructores = toSignal(
    this.usuarioService.instructoresPorSucursal$(this.sucursalId),
    { initialValue: [] as User[] }
  );

  readonly ausenciasFiltradas = computed(() => {
    const f = this.filtroEstado();
    if (f === 'todos') return this.ausencias();
    return this.ausencias().filter(a => a.estado === f);
  });

  readonly pendientesCount = computed(() =>
    this.ausencias().filter(a => a.estado === 'pendiente').length
  );

  getNombreInstructor(uid: string): string {
    return this.instructores().find(i => i.uid === uid)?.nombre ?? uid.substring(0, 8) + '...';
  }

  async aprobar(ausencia: InstructorAusencia): Promise<void> {
    const conf = await Swal.fire({
      icon: 'question',
      title: '¿Aprobar ausencia?',
      text: `${this.getNombreInstructor(ausencia.instructorUid)} — ${ausencia.tipo}`,
      showCancelButton: true,
      confirmButtonText: 'Aprobar',
      confirmButtonColor: '#2e7d32',
    });
    if (conf.isConfirmed) {
      await this.ausenciaService.actualizarEstado(ausencia.id!, 'aprobado');
      Swal.fire({ icon: 'success', title: 'Ausencia aprobada', timer: 1500, showConfirmButton: false });
    }
  }

  async rechazar(ausencia: InstructorAusencia): Promise<void> {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Rechazar ausencia?',
      text: `${this.getNombreInstructor(ausencia.instructorUid)} — ${ausencia.tipo}`,
      showCancelButton: true,
      confirmButtonText: 'Rechazar',
      confirmButtonColor: '#c62828',
    });
    if (conf.isConfirmed) {
      await this.ausenciaService.actualizarEstado(ausencia.id!, 'rechazado');
    }
  }

  async asignarReemplazo(ausencia: InstructorAusencia): Promise<void> {
    const disponibles = this.instructores().filter(i => i.uid !== ausencia.instructorUid && i.activo);
    const options = disponibles.reduce((acc, i) => ({ ...acc, [i.uid]: i.nombre }), {} as Record<string, string>);
    const { value: uid } = await Swal.fire({
      title: 'Asignar instructor reemplazo',
      input: 'select',
      inputOptions: options,
      showCancelButton: true,
      confirmButtonText: 'Asignar',
      confirmButtonColor: '#1a237e',
    });
    if (uid) {
      await this.ausenciaService.asignarReemplazo(ausencia.id!, uid);
      Swal.fire({ icon: 'success', title: 'Reemplazo asignado', timer: 1500, showConfirmButton: false });
    }
  }

  getTipoIcon(tipo: string): string {
    const map: Record<string, string> = {
      licencia: 'card_travel', enfermedad: 'sick', tramite: 'description',
      vacaciones: 'beach_access', otro: 'event_busy',
    };
    return map[tipo] ?? 'event_busy';
  }
}

import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { Turno } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-instructor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule, MatBadgeModule, EstadoTurnoPipe, FechaHoraPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class InstructorDashboardComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);

  readonly user = this.authService.currentUser;
  readonly loading = signal(false);
  readonly hoyStr = dateToStr(new Date());

  readonly turnosHoy = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? '', this.hoyStr),
    { initialValue: [] as Turno[] }
  );

  readonly todosTurnos = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: [] as Turno[] }
  );

  readonly pendientesConfirmacion = computed(() =>
    this.todosTurnos().filter(t => t.estado === 'PENDIENTE_CONFIRMACION')
  );

  readonly proximasConfirmadas = computed(() =>
    this.todosTurnos()
      .filter(t => t.estado === 'CONFIRMADA' && t.fechaStr >= this.hoyStr)
      .slice(0, 5)
  );

  async confirmar(turno: Turno): Promise<void> {
    this.loading.set(true);
    try {
      await this.turnoService.confirmarTurno(turno.id!);
      Swal.fire({ icon: 'success', title: 'Clase confirmada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } finally { this.loading.set(false); }
  }

  async rechazar(turno: Turno): Promise<void> {
    const { value: motivo } = await Swal.fire({
      title: 'Rechazar solicitud',
      input: 'textarea',
      inputLabel: 'Motivo del rechazo',
      inputPlaceholder: 'Indicá por qué rechazás esta clase...',
      showCancelButton: true,
      confirmButtonText: 'Rechazar',
      confirmButtonColor: '#c62828',
      cancelButtonText: 'Cancelar',
      inputValidator: v => !v ? 'El motivo es requerido' : undefined,
    });
    if (!motivo) return;
    this.loading.set(true);
    try {
      await this.turnoService.rechazarTurno(turno.id!, motivo);
      Swal.fire({ icon: 'info', title: 'Solicitud rechazada', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } finally { this.loading.set(false); }
  }
}

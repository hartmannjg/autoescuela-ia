import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { Turno } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-instructor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule, MatBadgeModule, MatProgressSpinnerModule, EstadoTurnoPipe, FechaHoraPipe, DuracionPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class InstructorDashboardComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);

  readonly user = this.authService.currentUser;
  readonly loading = signal(false);
  readonly loadingData = signal(true);
  readonly hoyStr = dateToStr(new Date());
  private _pending = 2;
  private readonly _markLoaded = () => { if (--this._pending === 0) this.loadingData.set(false); };

  // Hora actual como "HH:MM" — se recalcula al renderizar
  get horaActual(): string {
    const ahora = new Date();
    return `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  }

  readonly turnosHoy = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? '', this.hoyStr).pipe(tap(this._markLoaded)),
    { initialValue: [] as Turno[] }
  );

  readonly todosTurnos = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? '').pipe(tap(this._markLoaded)),
    { initialValue: [] as Turno[] }
  );

  readonly pendientesConfirmacion = computed(() =>
    this.todosTurnos().filter(t => t.estado === 'PENDIENTE_CONFIRMACION')
  );

  /** Clases futuras: fecha posterior a hoy, o mismo día pero horaFin aún no pasó */
  readonly proximasConfirmadas = computed(() => {
    const hoy = this.hoyStr;
    const ahora = this.horaActual;
    return this.todosTurnos()
      .filter(t =>
        t.estado === 'CONFIRMADA' &&
        (t.fechaStr > hoy || (t.fechaStr === hoy && t.horaFin > ahora))
      )
      .slice(0, 5);
  });

  /** Clases pasadas: fecha anterior a hoy, o mismo día y horaFin ya pasó */
  readonly historial = computed(() => {
    const hoy = this.hoyStr;
    const ahora = this.horaActual;
    return this.todosTurnos()
      .filter(t =>
        ['CONFIRMADA', 'COMPLETADA', 'AUSENTE'].includes(t.estado) &&
        (t.fechaStr < hoy || (t.fechaStr === hoy && t.horaFin <= ahora))
      )
      .slice(0, 10);
  });

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

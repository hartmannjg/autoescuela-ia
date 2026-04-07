import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { Turno } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-mis-turnos',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatTabsModule, MatDividerModule,
    EstadoTurnoPipe, FechaHoraPipe,
  ],
  templateUrl: './mis-turnos.component.html',
  styleUrl: './mis-turnos.component.scss',
})
export class MisTurnosComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  readonly loading = signal(false);

  readonly turnos = toSignal(
    this.turnoService.turnosAlumno$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: [] as Turno[] }
  );

  readonly proximos = computed(() =>
    this.turnos().filter(t => ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(t.estado))
  );
  readonly pasados = computed(() =>
    this.turnos().filter(t => ['COMPLETADA', 'AUSENTE', 'CANCELADA', 'RECHAZADA'].includes(t.estado))
  );

  async cancelar(turno: Turno): Promise<void> {
    const result = await Swal.fire({
      title: '¿Cancelar clase?',
      text: `Clase del ${turno.fechaStr} a las ${turno.horaInicio}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'No',
      confirmButtonColor: '#c62828',
    });
    if (!result.isConfirmed) return;
    this.loading.set(true);
    try {
      await this.turnoService.cancelarTurno(turno.id!);
      Swal.fire({ icon: 'success', title: 'Clase cancelada', confirmButtonColor: '#1a237e' });
    } finally {
      this.loading.set(false);
    }
  }
}

import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { Turno } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-mis-clases',
  standalone: true,
  imports: [CommonModule, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatTabsModule, MatProgressSpinnerModule, EstadoTurnoPipe, FechaHoraPipe, DuracionPipe],
  templateUrl: './mis-clases.component.html',
  styleUrl: './mis-clases.component.scss',
})
export class MisClasesComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);

  readonly hoyStr = dateToStr(new Date());
  readonly loading = signal(true);

  readonly turnos = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? '').pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as Turno[] }
  );

  readonly proximas = computed(() =>
    this.turnos().filter(t => t.fechaStr >= this.hoyStr && ['CONFIRMADA', 'PENDIENTE_CONFIRMACION'].includes(t.estado))
  );

  readonly historial = computed(() =>
    this.turnos().filter(t => t.fechaStr < this.hoyStr || ['COMPLETADA', 'CANCELADA', 'AUSENTE'].includes(t.estado))
  );

  readonly agrupadoPorFecha = computed(() => {
    const map = new Map<string, Turno[]>();
    this.proximas().forEach(t => {
      const grupo = map.get(t.fechaStr) ?? [];
      grupo.push(t);
      map.set(t.fechaStr, grupo);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });
}

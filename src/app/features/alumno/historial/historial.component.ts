import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule } from '@angular/material/paginator';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map, tap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { Turno, FeedbackClase } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatExpansionModule, MatDividerModule, MatProgressSpinnerModule, MatPaginatorModule, FechaHoraPipe],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.scss',
})
export class HistorialComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private feedbackService = inject(FeedbackService);
  readonly pagina = signal(0);
  readonly pageSize = 15;

  readonly uid = this.authService.currentUser()?.uid ?? '';
  readonly loading = signal(true);
  private _pending = 2;
  private readonly _markLoaded = () => { if (--this._pending === 0) this.loading.set(false); };

  readonly turnos = toSignal(
    this.turnoService.turnosAlumno$(this.uid).pipe(tap(this._markLoaded)),
    { initialValue: [] as Turno[] }
  );

  readonly feedbacks = toSignal(
    this.feedbackService.feedbackAlumno$(this.uid).pipe(tap(this._markLoaded)),
    { initialValue: [] as FeedbackClase[] }
  );

  readonly historial = computed(() => {
    const fbs = this.feedbacks();
    return this.turnos()
      .filter(t => t.estado === 'COMPLETADA')
      .map(t => ({
        turno: t,
        feedback: fbs.find(f => f.turnoId === t.id),
      }));
  });

  readonly historialPaginado = computed(() =>
    this.historial().slice(this.pagina() * this.pageSize, (this.pagina() + 1) * this.pageSize)
  );

  readonly progresoNivel = computed(() => {
    return this.historial()
      .filter(h => h.feedback?.instructorFeedback?.nivelAlumno)
      .map(h => ({ fecha: h.turno.fechaStr, nivel: h.feedback!.instructorFeedback!.nivelAlumno }))
      .reverse();
  });

  getEstrellas(n: number): number[] {
    return Array.from({ length: 5 }, (_, i) => i < n ? 1 : 0);
  }
}

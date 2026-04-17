import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { Turno } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';

@Component({
  selector: 'app-alumno-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatProgressBarModule, MatProgressSpinnerModule, MatDividerModule,
    EstadoTurnoPipe, FechaHoraPipe, DuracionPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class AlumnoDashboardComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private feedbackService = inject(FeedbackService);

  readonly user = this.authService.currentUser;
  readonly alumnoData = computed(() => this.user()?.alumnoData);
  readonly planContratado = computed(() => this.alumnoData()?.planContratado);
  readonly creditoIndividual = computed(() => this.alumnoData()?.creditoIndividual);
  readonly bloqueado = computed(() => this.alumnoData()?.bloqueado ?? false);
  readonly loading = signal(true);
  private _pending = 2;
  private readonly _markLoaded = () => { if (--this._pending === 0) this.loading.set(false); };

  readonly turnos = toSignal(
    this.turnoService.turnosAlumno$(this.authService.currentUser()?.uid ?? '').pipe(tap(this._markLoaded)),
    { initialValue: [] as Turno[] }
  );

  readonly pendientesFeedback = toSignal(
    this.feedbackService.pendientesAlumno$(this.authService.currentUser()?.uid ?? '').pipe(tap(this._markLoaded)),
    { initialValue: [] }
  );

  readonly proximosTurnos = computed(() => {
    const ahora = new Date();
    const fechaStr = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    const horaStr = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    return this.turnos()
      .filter(t =>
        ['CONFIRMADA', 'PENDIENTE_CONFIRMACION'].includes(t.estado) &&
        (t.fechaStr > fechaStr || (t.fechaStr === fechaStr && t.horaFin > horaStr))
      )
      .slice(0, 3);
  });

  readonly clasesDisponibles = computed(() => {
    const plan = this.planContratado()?.clasesRestantes ?? 0;
    const credito = this.creditoIndividual()?.clasesDisponibles ?? 0;
    return plan + credito;
  });

  readonly progresoClases = computed(() => {
    const plan = this.planContratado();
    if (!plan) return 0;
    return Math.round((plan.clasesTomadas / plan.clasesTotales) * 100);
  });

  readonly turnosStats = computed(() => {
    const ts = this.turnos();
    return {
      agendadas:   ts.filter(t => t.estado === 'PENDIENTE_CONFIRMACION').length,
      confirmadas: ts.filter(t => t.estado === 'CONFIRMADA').length,
      completadas: ts.filter(t => t.estado === 'COMPLETADA').length,
    };
  });

  /** Tipos de clases individuales asignadas por el admin (solo los que tienen > 0) */
  readonly clasesIndividualesPorTipo = computed(() => {
    const ci = this.creditoIndividual();
    if (!ci) return [];
    const tipos: { duracion: number; cantidad: number }[] = [];
    if ((ci.clases40min ?? 0) > 0) tipos.push({ duracion: 40, cantidad: ci.clases40min! });
    if (tipos.length === 0 && ci.clasesDisponibles > 0) {
      tipos.push({ duracion: 40, cantidad: ci.clasesDisponibles });
    }
    return tipos;
  });

  readonly alertas = computed(() => {
    const alertas: { tipo: 'warn' | 'error' | 'info'; mensaje: string }[] = [];
    const alumno = this.alumnoData();
    if (!alumno) return alertas;

    if (alumno.bloqueado) {
      alertas.push({ tipo: 'error', mensaje: `Cuenta bloqueada: ${alumno.motivoBloqueo}` });
    }
    if (this.pendientesFeedback().length > 0) {
      alertas.push({ tipo: 'info', mensaje: `Tenés ${this.pendientesFeedback().length} clase(s) pendiente(s) de calificar.` });
    }
    return alertas;
  });
}

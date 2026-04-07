import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { Turno } from '../../../shared/models';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-alumno-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    MatCardModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatProgressBarModule, MatDividerModule,
    EstadoTurnoPipe, FechaHoraPipe,
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

  readonly turnos = toSignal(
    this.turnoService.turnosAlumno$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: [] as Turno[] }
  );

  readonly pendientesFeedback = toSignal(
    this.feedbackService.pendientesAlumno$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: [] }
  );

  readonly proximosTurnos = computed(() =>
    this.turnos()
      .filter(t => t.estado === 'CONFIRMADA' || t.estado === 'PENDIENTE_CONFIRMACION')
      .slice(0, 3)
  );

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

  readonly alertas = computed(() => {
    const alertas: { tipo: 'warn' | 'error' | 'info'; mensaje: string }[] = [];
    const alumno = this.alumnoData();
    if (!alumno) return alertas;

    if (alumno.bloqueado) {
      alertas.push({ tipo: 'error', mensaje: `Cuenta bloqueada: ${alumno.motivoBloqueo}` });
    }
    if (this.clasesDisponibles() === 0) {
      alertas.push({ tipo: 'warn', mensaje: 'No tenés clases disponibles. Comprá un paquete.' });
    }
    if (this.clasesDisponibles() <= 2 && this.clasesDisponibles() > 0) {
      alertas.push({ tipo: 'warn', mensaje: `Te quedan solo ${this.clasesDisponibles()} clases. ¡Recargá pronto!` });
    }
    if (this.pendientesFeedback().length > 0) {
      alertas.push({ tipo: 'info', mensaje: `Tenés ${this.pendientesFeedback().length} clase(s) pendiente(s) de calificar.` });
    }
    return alertas;
  });
}

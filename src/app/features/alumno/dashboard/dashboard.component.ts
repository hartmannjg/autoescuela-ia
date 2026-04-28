import { Component, inject, signal, computed, OnInit } from '@angular/core';

interface NivelAlumno {
  nivel: number;
  emoji: string;
  titulo: string;
  subtitulo: string;
  color: string;
}

const NIVELES: NivelAlumno[] = [
  { nivel: 1, emoji: '🐣', titulo: 'Principiante', subtitulo: 'Primer arranque… con fuerza 😅',    color: '#e8f5e9' },
  { nivel: 2, emoji: '🚗', titulo: 'Urbano',   subtitulo: 'Plata y miedo nunca tuvimos',            color: '#fffde7' },
  { nivel: 3, emoji: '🏎️', titulo: 'Avanzado', subtitulo: 'Estaciono en 2 maniobras… o menos 😏', color: '#fff3e0' },
  { nivel: 4, emoji: '🎓', titulo: 'Listo',    subtitulo: 'Hoy rindo y apruebo 💪',                 color: '#e3f2fd' },
];
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
import { ConfiguracionService } from '../../../core/services/configuracion.service';
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
export class AlumnoDashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private feedbackService = inject(FeedbackService);
  private configService = inject(ConfiguracionService);

  readonly maxReagendas = signal<number>(4);

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

  readonly nivelAlumno = computed((): NivelAlumno => {
    const plan = this.planContratado();
    const ci = this.creditoIndividual();
    const totalPlan       = plan?.clasesTotales ?? 0;
    const tomadasPlan     = plan?.clasesTomadas ?? 0;
    const totalIndividual = (ci?.clasesDisponibles ?? 0) + (ci?.clasesTomadas ?? 0);
    const tomadasIndividual = ci?.clasesTomadas ?? 0;
    const total  = totalPlan + totalIndividual;
    const tomadas = tomadasPlan + tomadasIndividual;
    if (total === 0) return NIVELES[0];
    const pct = tomadas / total;
    if (pct < 0.25) return NIVELES[0];
    if (pct < 0.50) return NIVELES[1];
    if (pct < 0.75) return NIVELES[2];
    return NIVELES[3];
  });

  readonly ritmoSugerido = computed(() => {
    const plan = this.planContratado();
    if (!plan || plan.clasesRestantes <= 0) return null;
    const fechaFin: Date = (plan.fechaFin as any)?.toDate?.() ?? new Date(plan.fechaFin as any);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const msPorSemana = 7 * 24 * 60 * 60 * 1000;
    const semanasRestantes = (fechaFin.getTime() - hoy.getTime()) / msPorSemana;
    if (semanasRestantes <= 0) return { vencido: true, clasesPorSemana: 0, semanasRestantes: 0 };
    return {
      vencido: false,
      clasesPorSemana: Math.ceil(plan.clasesRestantes / semanasRestantes),
      semanasRestantes: Math.ceil(semanasRestantes),
    };
  });

  async ngOnInit(): Promise<void> {
    const sucursalId = this.user()?.sucursalId ?? '';
    const [global, override] = await Promise.all([
      this.configService.getOnce(),
      sucursalId ? this.configService.getSucursalOnce(sucursalId) : Promise.resolve(null),
    ]);
    const efectivo = override?.maxReagendasPorSemana ?? global.limites.maxReagendasPorSemana;
    this.maxReagendas.set(efectivo);
  }

  readonly alertas = computed(() => {
    const alertas: { tipo: 'warn' | 'error' | 'info'; mensaje: string }[] = [];
    const alumno = this.alumnoData();
    if (!alumno) return alertas;

    if (alumno.bloqueado) {
      alertas.push({ tipo: 'error', mensaje: `Cuenta bloqueada: ${alumno.motivoBloqueo}` });
    }

    const plan = alumno.planContratado;
    if (plan && plan.clasesRestantes > 0) {
      const fechaFin: Date = (plan.fechaFin as any)?.toDate?.() ?? new Date(plan.fechaFin as any);
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const diasRestantes = Math.ceil((fechaFin.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      if (diasRestantes < 0) {
        alertas.push({ tipo: 'error', mensaje: 'Tu plan está vencido. Contactá al administrador para renovarlo.' });
      } else if (diasRestantes <= 14) {
        alertas.push({ tipo: 'warn', mensaje: `Tu plan vence en ${diasRestantes} día${diasRestantes !== 1 ? 's' : ''}. ¡Agendá tus clases!` });
      }
      const semanasInactivas = plan.semanasInactivas ?? 0;
      if (semanasInactivas === 1) {
        alertas.push({ tipo: 'warn', mensaje: 'No agendaste clases la semana pasada. Si no agendás esta semana, perderás una clase de tu plan.' });
      } else if (semanasInactivas >= 2) {
        alertas.push({ tipo: 'error', mensaje: `Llevas ${semanasInactivas} semanas sin agendar. Se descontaron clases de tu plan por inactividad.` });
      }
    }

    if (this.pendientesFeedback().length > 0) {
      alertas.push({ tipo: 'info', mensaje: `Tenés ${this.pendientesFeedback().length} clase(s) pendiente(s) de calificar.` });
    }
    return alertas;
  });
}

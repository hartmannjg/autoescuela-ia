import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { SucursalService } from '../../../core/services/sucursal.service';
import { User, Sucursal } from '../../../shared/models';
import { dateToStr, calcularHoraFin, generarSlots } from '../../../shared/utils/date-utils';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';

const DIAS_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface SlotRecurrente {
  instructor: User;
  dia: number;        // 0=Dom, 1=Lun, ..., 6=Sáb
  horaInicio: string; // "09:00"
  horaFin: string;    // "10:00"
}

interface PreviewResult {
  total: number;
  semanas: number;
  fechaInicio: string | null;
  fechaFin: string | null;
}

@Component({
  selector: 'app-asignacion-masiva',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatFormFieldModule, MatProgressBarModule, MatProgressSpinnerModule, MatDividerModule,
    MatInputModule, MatChipsModule, DuracionPipe,
  ],
  templateUrl: './asignacion-masiva.component.html',
  styleUrl: './asignacion-masiva.component.scss',
})
export class AsignacionMasivaComponent implements OnInit {
  private authService   = inject(AuthService);
  private turnoService  = inject(TurnoService);
  private usuarioService = inject(UsuarioService);
  private sucursalService = inject(SucursalService);

  readonly user = this.authService.currentUser;
  readonly loading  = signal(false);
  readonly progreso = signal(0);   // 0-100
  readonly sucursal = signal<Sucursal | null>(null);

  readonly instructores = toSignal(
    this.usuarioService.instructoresActivos$(this.user()?.sucursalId ?? ''),
    { initialValue: [] as User[] }
  );

  // ── Slots recurrentes seleccionados ──────────────────────────────────────
  readonly slotsRecurrentes = signal<SlotRecurrente[]>([]);

  // ── Formulario temporal para agregar un slot ─────────────────────────────
  readonly instructorTemp = signal<User | null>(null);
  readonly diaTemp        = signal<number | null>(null);
  readonly horaTemp       = signal<string | null>(null);

  // ── Config ───────────────────────────────────────────────────────────────
  readonly maxPorSemana = signal(1);

  // ── Plan del alumno ───────────────────────────────────────────────────────
  readonly plan     = computed(() => this.user()?.alumnoData?.planContratado);
  readonly duracion = computed((): 40 | 80 => this.plan()?.duracionClase ?? 40);

  // ── Días disponibles para el instructor temp ─────────────────────────────
  readonly diasDisponibles = computed((): { dia: number; nombre: string }[] => {
    const inst = this.instructorTemp();
    if (!inst) return [];
    const diasSuc  = this.sucursal()?.configuracionHorarios.diasLaborales ?? [1, 2, 3, 4, 5, 6];
    const diasInst = inst.instructorData?.horariosDisponibles?.map(h => h.dia) ?? [];
    return diasInst
      .filter(d => diasSuc.includes(d))
      .map(d => ({ dia: d, nombre: DIAS_NOMBRES[d] }));
  });

  // ── Horas disponibles para instructor+día temp ───────────────────────────
  readonly horasDisponibles = computed((): string[] => {
    const inst = this.instructorTemp();
    const dia  = this.diaTemp();
    const suc  = this.sucursal();
    if (!inst || dia === null || !suc) return [];

    const horario = inst.instructorData?.horariosDisponibles?.find(h => h.dia === dia);
    if (!horario) return [];

    const apertura = horario.horaInicio > suc.configuracionHorarios.horarioApertura
      ? horario.horaInicio : suc.configuracionHorarios.horarioApertura;
    const cierre   = horario.horaFin < suc.configuracionHorarios.horarioCierre
      ? horario.horaFin : suc.configuracionHorarios.horarioCierre;

    const horas: string[] = [];
    const [hF, mF] = cierre.split(':').map(Number);
    const fin = hF * 60 + mF;
    const dur = this.duracion();
    let [h, m] = apertura.split(':').map(Number);
    let cur = h * 60 + m;
    while (cur + dur <= fin) {
      horas.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
      cur += dur;
    }
    return horas;
  });

  readonly ocupadosDia           = signal<Set<string>>(new Set());
  readonly cargandoDisponibilidad = signal(false);

  readonly maxSemanaDelPlan = computed(() => this.plan()?.maxClasesPorSemana ?? 99);
  readonly minSemanaDelPlan = computed(() => this.plan()?.minClasesPorSemana ?? 1);

  readonly limiteDiaAlcanzado = computed(() => {
    const dia = this.diaTemp();
    const max = this.plan()?.maxClasesPorDia ?? null;
    if (dia === null || max === null) return false;
    return this.slotsRecurrentes().filter(s => s.dia === dia).length >= max;
  });

  readonly limiteSemanaAlcanzado = computed(() => {
    const max = this.plan()?.maxClasesPorSemana ?? null;
    if (max === null) return false;
    return this.slotsRecurrentes().length >= max;
  });

  readonly puedeAgregar = computed(() =>
    this.instructorTemp() !== null &&
    this.diaTemp() !== null &&
    this.horaTemp() !== null &&
    !this.limiteDiaAlcanzado() &&
    !this.limiteSemanaAlcanzado()
  );

  readonly horasConEstado = computed(() => {
    const horas    = this.horasDisponibles();
    const ocupados = this.ocupadosDia();
    const dur      = this.duracion();
    const dia      = this.diaTemp();
    const fechaRef = dia !== null ? this.proximaFechaDia(dia) : '';
    const yaEnPlan = new Set(this.slotsRecurrentes().filter(s => s.dia === dia).map(s => s.horaInicio));
    return horas.map(hora => ({
      hora,
      ocupado:   generarSlots(fechaRef, hora, dur).some(s => ocupados.has(s)),
      yaEnPlan:  yaEnPlan.has(hora),
    }));
  });

  // ── Preview (dry-run sin verificar disponibilidad real) ──────────────────
  readonly preview = computed((): PreviewResult | null => {
    const slots = this.slotsRecurrentes();
    if (slots.length === 0) return null;
    const plan = this.plan();
    if (!plan || plan.clasesRestantes === 0) return null;

    const maxSemana  = Math.min(this.maxPorSemana(), slots.length);
    const maxPorDia  = plan.maxClasesPorDia ?? null;
    const today      = new Date(); today.setHours(0, 0, 0, 0);
    const monday     = this.mondayOfCurrentWeek();
    const porFecha   = new Map<string, number>();

    let remaining = plan.clasesRestantes;
    let week = 0;
    let fechaInicio: string | null = null;
    let fechaFin: string | null = null;
    let totalCreados = 0;

    while (remaining > 0 && week < 104) {
      let thisWeek = 0;
      for (const slot of slots) {
        if (remaining <= 0 || thisWeek >= maxSemana) break;
        const date = this.dateForSlot(monday, week, slot.dia);
        if (date < today) continue;
        const ds = dateToStr(date);
        if (maxPorDia !== null && (porFecha.get(ds) ?? 0) >= maxPorDia) continue;
        porFecha.set(ds, (porFecha.get(ds) ?? 0) + 1);
        if (!fechaInicio) fechaInicio = ds;
        fechaFin = ds;
        remaining--;
        thisWeek++;
        totalCreados++;
      }
      week++;
    }

    return { total: totalCreados, semanas: week, fechaInicio, fechaFin };
  });

  async ngOnInit(): Promise<void> {
    const sucId = this.user()?.sucursalId;
    if (sucId) this.sucursal.set(await this.sucursalService.getById(sucId));
  }

  nombreDia(dia: number): string { return DIAS_NOMBRES[dia]; }

  onInstructorChange(inst: User | null): void {
    this.instructorTemp.set(inst);
    this.diaTemp.set(null);
    this.horaTemp.set(null);
    this.ocupadosDia.set(new Set());
  }

  onDiaChange(dia: number | null): void {
    this.diaTemp.set(dia);
    this.horaTemp.set(null);
    void this.cargarDisponibilidadDia();
  }

  private async cargarDisponibilidadDia(): Promise<void> {
    const inst = this.instructorTemp();
    const dia  = this.diaTemp();
    if (!inst || dia === null) { this.ocupadosDia.set(new Set()); return; }
    this.cargandoDisponibilidad.set(true);
    try {
      this.ocupadosDia.set(await this.turnoService.getSlotsOcupados(inst.uid, this.proximaFechaDia(dia)));
    } finally {
      this.cargandoDisponibilidad.set(false);
    }
  }

  private proximaFechaDia(dia: number): string {
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const monday = this.mondayOfCurrentWeek();
    const d      = new Date(monday);
    d.setDate(monday.getDate() + (dia === 0 ? 6 : dia - 1));
    if (d < today) d.setDate(d.getDate() + 7);
    return dateToStr(d);
  }

  agregarSlot(): void {
    const inst = this.instructorTemp();
    const dia  = this.diaTemp();
    const hora = this.horaTemp();
    if (!inst || dia === null || !hora) return;
    if (this.limiteDiaAlcanzado()) return;

    const existe = this.slotsRecurrentes().some(
      s => s.dia === dia && s.horaInicio === hora && s.instructor.uid === inst.uid
    );
    if (existe) return;

    const horaFin = calcularHoraFin(hora, this.duracion());
    this.slotsRecurrentes.update(slots => [...slots, { instructor: inst, dia, horaInicio: hora, horaFin }]);
    const nuevoLen = this.slotsRecurrentes().length;
    this.maxPorSemana.set(Math.min(nuevoLen, this.maxSemanaDelPlan()));
    this.diaTemp.set(null);
    this.horaTemp.set(null);
  }

  setMaxPorSemana(val: number): void {
    this.maxPorSemana.set(Math.min(Math.max(this.minSemanaDelPlan(), val), this.maxSemanaDelPlan()));
  }

  quitarSlot(i: number): void {
    this.slotsRecurrentes.update(s => s.filter((_, idx) => idx !== i));
    const len    = this.slotsRecurrentes().length;
    const maxPla = this.maxSemanaDelPlan();
    this.maxPorSemana.set(Math.max(1, Math.min(this.maxPorSemana(), len, maxPla)));
  }

  async confirmarMasivo(): Promise<void> {
    const prev = this.preview();
    const plan = this.plan();
    const user = this.user();
    if (!prev || !plan || !user || prev.total === 0) return;

    const fechaFinFmt = prev.fechaFin
      ? new Date(prev.fechaFin + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';

    const r = await Swal.fire({
      title: `Agendar ${prev.total} clases`,
      html: `Se crearán clases en <strong>${prev.semanas}</strong> semanas, hasta el <strong>${fechaFinFmt}</strong>.<br><br>Las clases quedarán como <em>pendientes de confirmación</em> del instructor.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, agendar todas',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#1a237e',
    });
    if (!r.isConfirmed) return;

    this.loading.set(true);
    this.progreso.set(0);

    const slots     = this.slotsRecurrentes();
    const maxSemana = Math.min(this.maxPorSemana(), slots.length);
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const monday    = this.mondayOfCurrentWeek();
    const duracion  = this.duracion();

    // ── Construir lista completa de turnos a crear ────────────────────────────
    interface TurnoPlanificado { instructorUid: string; instructorNombre: string; fechaStr: string; fecha: Date; horaInicio: string; }
    const planificados: TurnoPlanificado[] = [];
    const maxPorDia  = plan.maxClasesPorDia ?? null;
    const porFecha   = new Map<string, number>();
    let remaining = plan.clasesRestantes;
    let week = 0;
    while (remaining > 0 && week < 104) {
      let thisWeek = 0;
      for (const slot of slots) {
        if (remaining <= 0 || thisWeek >= maxSemana) break;
        const date = this.dateForSlot(monday, week, slot.dia);
        if (date < today) continue;
        const ds = dateToStr(date);
        if (maxPorDia !== null && (porFecha.get(ds) ?? 0) >= maxPorDia) continue;
        porFecha.set(ds, (porFecha.get(ds) ?? 0) + 1);
        planificados.push({ instructorUid: slot.instructor.uid, instructorNombre: slot.instructor.nombre, fechaStr: ds, fecha: date, horaInicio: slot.horaInicio });
        remaining--;
        thisWeek++;
      }
      week++;
    }

    // ── Fase 1: validar disponibilidad de todos los slots ─────────────────────
    // Agrupar por (instructorUid, fechaStr) para minimizar queries
    const claveMap = new Map<string, Set<string>>();
    for (const t of planificados) {
      const clave = `${t.instructorUid}|${t.fechaStr}`;
      if (!claveMap.has(clave)) claveMap.set(clave, new Set());
      generarSlots(t.fechaStr, t.horaInicio, duracion).forEach(s => claveMap.get(clave)!.add(s));
    }

    // Ocupados por instructor/día
    const ocupadosMap = new Map<string, Set<string>>();
    await Promise.all(
      [...claveMap.entries()].map(async ([clave]) => {
        const [instUid, fechaStr] = clave.split('|');
        ocupadosMap.set(clave, await this.turnoService.getSlotsOcupados(instUid, fechaStr));
      })
    );

    // Slots propios del alumno agrupados por fecha
    const alumnoSlotsPorFecha = new Map<string, Set<string>>();
    for (const t of planificados) {
      if (!alumnoSlotsPorFecha.has(t.fechaStr)) {
        alumnoSlotsPorFecha.set(t.fechaStr, await this.turnoService.getSlotsAlumno(user.uid, t.fechaStr));
      }
    }

    const conflictos: string[] = [];
    for (const t of planificados) {
      const clave = `${t.instructorUid}|${t.fechaStr}`;
      const ocupados = ocupadosMap.get(clave) ?? new Set<string>();
      const propios  = alumnoSlotsPorFecha.get(t.fechaStr) ?? new Set<string>();
      const slotsTurno = generarSlots(t.fechaStr, t.horaInicio, duracion);
      const fechaFmt = new Date(t.fechaStr + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (slotsTurno.some(s => ocupados.has(s))) {
        conflictos.push(`${fechaFmt} ${t.horaInicio} con ${t.instructorNombre} — horario ocupado`);
      } else if (slotsTurno.some(s => propios.has(s))) {
        conflictos.push(`${fechaFmt} ${t.horaInicio} — ya tenés una clase en ese horario`);
      }
    }

    if (conflictos.length > 0) {
      this.loading.set(false);
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo agendar',
        html: `Los siguientes horarios no están disponibles. Corregí la configuración y volvé a intentarlo.<br><br><ul style="text-align:left;margin:0;padding-left:20px">${conflictos.map(c => `<li>${c}</li>`).join('')}</ul>`,
        confirmButtonColor: '#1a237e',
        confirmButtonText: 'Entendido',
      });
      this.progreso.set(0);
      return;
    }

    // ── Fase 2: crear todos los turnos ────────────────────────────────────────
    const total = planificados.length;
    let creados = 0;
    for (const t of planificados) {
      await this.turnoService.crearTurno({
        alumnoUid:            user.uid,
        instructorUid:        t.instructorUid,
        sucursalId:           user.sucursalId,
        fecha:                t.fecha as any,
        fechaStr:             t.fechaStr,
        horaInicio:           t.horaInicio,
        duracionMinutos:      duracion,
        estado:               'PENDIENTE_CONFIRMACION',
        tipoClase:            'plan',
        consumidoDe:          'plan',
        asistenciaVerificada: false,
      });
      creados++;
      this.progreso.set(Math.round(creados / total * 100));
    }

    this.loading.set(false);
    await this.authService.recargarUsuario();

    await Swal.fire({
      icon: 'success',
      title: `${creados} clase${creados !== 1 ? 's' : ''} agendada${creados !== 1 ? 's' : ''}`,
      text: 'Todas las clases fueron agendadas exitosamente.',
      confirmButtonColor: '#1a237e',
    });

    this.slotsRecurrentes.set([]);
    this.progreso.set(0);
  }

  // ── Utilidades de fecha ───────────────────────────────────────────────────

  private mondayOfCurrentWeek(): Date {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = today.getDay(); // 0=Dom
    const offset = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - offset);
    return monday;
  }

  private dateForSlot(monday: Date, weekOffset: number, dia: number): Date {
    // dia: 0=Dom→offset 6, 1=Lun→0, 2=Mar→1, ...
    const daysFromMonday = dia === 0 ? 6 : dia - 1;
    const date = new Date(monday);
    date.setDate(monday.getDate() + weekOffset * 7 + daysFromMonday);
    return date;
  }
}

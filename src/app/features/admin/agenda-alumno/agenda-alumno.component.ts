import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { SucursalService } from '../../../core/services/sucursal.service';
import { FeriadoService } from '../../../core/services/feriado.service';
import { CierreService } from '../../../core/services/cierre.service';
import { User, Sucursal } from '../../../shared/models';
import { generarSlotsDia, SlotDisponible } from '../../../shared/utils/slot-utils';
import { dateToStr, strToDate, slotKey, calcularHoraFin, generarSlots } from '../../../shared/utils/date-utils';
import { DuracionPipe, formatDuracion } from '../../../shared/pipes/duracion.pipe';
import { DisponibilidadGridComponent } from '../../../shared/components/disponibilidad-grid/disponibilidad-grid.component';

type Modo = 'individual' | 'masiva';
type PagModo = 'agendar' | 'disponibilidad';

const DIAS_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface DiaCalendario {
  fecha: Date;
  fechaStr: string;
  esHoy: boolean;
  esPasado: boolean;
  esLaborable: boolean;
  feriadoNombre: string | null;
  cierreMotivo: string | null;
}


interface SlotRecurrente {
  instructor: User;
  dia: number;
  horaInicio: string;
  horaFin: string;
}

@Component({
  selector: 'app-agenda-alumno',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatProgressSpinnerModule, MatProgressBarModule,
    MatTooltipModule, MatDividerModule, DuracionPipe, DisponibilidadGridComponent,
  ],
  templateUrl: './agenda-alumno.component.html',
  styleUrl: './agenda-alumno.component.scss',
})
export class AgendaAlumnoComponent implements OnInit {
  private authService     = inject(AuthService);
  private turnoService    = inject(TurnoService);
  private usuarioService  = inject(UsuarioService);
  private sucursalService = inject(SucursalService);
  private feriadoService  = inject(FeriadoService);
  private cierreService   = inject(CierreService);
  private route           = inject(ActivatedRoute);

  private readonly admin = this.authService.currentUser;

  // ── Estado general ─────────────────────────────────────────────────────────
  readonly loading      = signal(false);
  readonly loadingSlots = signal(false);
  readonly sucursal     = signal<Sucursal | null>(null);

  private readonly sucursalId = this.admin()?.sucursalId ?? '';
  readonly feriados = toSignal(this.feriadoService.feriados$(this.sucursalId), { initialValue: [] });
  readonly cierres  = toSignal(this.cierreService.cierres$(this.sucursalId),   { initialValue: [] });
  readonly modo         = signal<Modo>('individual');
  readonly pagModo      = signal<PagModo>('agendar');


  // ── Selección de alumno ────────────────────────────────────────────────────
  readonly alumnoSeleccionado = signal<User | null>(null);
  readonly filtroAlumno       = signal('');

  readonly alumnos = toSignal(
    this.usuarioService.alumnosPorSucursal$(this.admin()?.sucursalId ?? ''),
    { initialValue: [] as User[] }
  );

  readonly alumnosFiltrados = computed(() => {
    const f = this.filtroAlumno().toLowerCase().trim();
    return f ? this.alumnos().filter(a =>
      a.nombre.toLowerCase().includes(f) || a.email.toLowerCase().includes(f)
    ) : this.alumnos();
  });

  readonly instructores = toSignal(
    this.usuarioService.instructoresActivos$(this.admin()?.sucursalId ?? ''),
    { initialValue: [] as User[] }
  );

  // ── Datos del alumno seleccionado ──────────────────────────────────────────
  readonly alumnoData     = computed(() => this.alumnoSeleccionado()?.alumnoData);
  readonly planContratado = computed(() => this.alumnoData()?.planContratado);

  private readonly tienePlan = computed(() => {
    const p = this.planContratado();
    return !!(p && p.clasesRestantes > 0);
  });
  private readonly tieneCredito = computed(() =>
    (this.alumnoData()?.creditoIndividual?.clasesDisponibles ?? 0) > 0
  );
  readonly tieneSaldo = computed(() => this.tienePlan() || this.tieneCredito());

  // ════════════════════════════════════════════════════════════════════════════
  // MODO INDIVIDUAL
  // ════════════════════════════════════════════════════════════════════════════

  readonly instructorSeleccionado = signal<User | null>(null);
  readonly semanaOffset           = signal(0);
  readonly fechaSeleccionada      = signal<string | null>(null);
  readonly slotsDelDia            = signal<SlotDisponible[]>([]);
  readonly slotSeleccionado       = signal<SlotDisponible | null>(null);
  readonly fuenteSeleccionada     = signal<'plan' | 'credito_individual' | null>(null);
  private readonly misClasesMap   = signal<Map<string, string>>(new Map());
  private readonly cierreEfectivo = signal<string>('');

  readonly debeMostrarSelectorFuente = computed(() => this.tienePlan() && this.tieneCredito());

  readonly fuenteEfectiva = computed((): 'plan' | 'credito_individual' => {
    if (!this.tieneCredito()) return 'plan';
    if (!this.tienePlan())    return 'credito_individual';
    return this.fuenteSeleccionada() ?? 'plan';
  });

  readonly usaPlan = computed(() => this.fuenteEfectiva() === 'plan');

  readonly duracionClaseIndividual = computed((): 40 | 80 => {
    if (this.usaPlan()) return this.planContratado()?.duracionClase ?? 40;
    return 40;
  });

  readonly diasSemana = computed(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - hoy.getDay() + 1 + this.semanaOffset() * 7);
    const diasLabSucursal   = this.sucursal()?.configuracionHorarios.diasLaborales ?? [1,2,3,4,5,6];
    const diasLabInstructor = this.instructorSeleccionado()?.instructorData?.horariosDisponibles?.map(h => h.dia) ?? null;
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + i);
      const diaSemana = fecha.getDay();
      return {
        fecha,
        fechaStr: dateToStr(fecha),
        esHoy:      dateToStr(fecha) === dateToStr(hoy),
        esPasado:   fecha < hoy,
        esLaborable: diasLabSucursal.includes(diaSemana) &&
          (diasLabInstructor === null || diasLabInstructor.includes(diaSemana)) &&
          !this.getFeriadoNombre(dateToStr(fecha)) &&
          !this.getCierreMotivo(dateToStr(fecha)),
        feriadoNombre: this.getFeriadoNombre(dateToStr(fecha)),
        cierreMotivo:  this.getCierreMotivo(dateToStr(fecha)),
      } as DiaCalendario;
    });
  });

  readonly semanaLabel = computed(() => {
    const dias = this.diasSemana();
    const ini  = dias[0].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    const fin  = dias[6].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${ini} - ${fin}`;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // MODO MASIVA
  // ════════════════════════════════════════════════════════════════════════════

  readonly progreso              = signal(0);
  readonly slotsRecurrentes      = signal<SlotRecurrente[]>([]);
  readonly maxPorSemana          = signal(1);
  readonly instructorTemp        = signal<User | null>(null);
  readonly diaTemp               = signal<number | null>(null);
  readonly horaTemp              = signal<string | null>(null);
  readonly ocupadosDia           = signal<Set<string>>(new Set());
  readonly cargandoDisponibilidad = signal(false);
  readonly slotAgregadoFeedback  = signal<string | null>(null);
  private feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  readonly duracionMasiva = computed((): 40 | 80 => this.planContratado()?.duracionClase ?? 40);

  readonly diasDisponibles = computed((): { dia: number; nombre: string }[] => {
    const inst = this.instructorTemp();
    if (!inst) return [];
    const diasSuc  = this.sucursal()?.configuracionHorarios.diasLaborales ?? [1,2,3,4,5,6];
    const diasInst = inst.instructorData?.horariosDisponibles?.map(h => h.dia) ?? [];
    return diasInst.filter(d => diasSuc.includes(d)).map(d => ({ dia: d, nombre: DIAS_NOMBRES[d] }));
  });

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
    const dur = this.duracionMasiva();
    const [hF, mF] = cierre.split(':').map(Number);
    const fin = hF * 60 + mF;
    let [h, m] = apertura.split(':').map(Number);
    let cur = h * 60 + m;
    const horas: string[] = [];
    while (cur + dur <= fin) {
      horas.push(`${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`);
      cur += dur;
    }
    return horas;
  });

  readonly maxSemanaDelPlan = computed(() => this.planContratado()?.maxClasesPorSemana ?? 99);
  readonly minSemanaDelPlan = computed(() => this.planContratado()?.minClasesPorSemana ?? 1);

  readonly limiteDiaAlcanzado = computed(() => {
    const dia = this.diaTemp();
    const max = this.planContratado()?.maxClasesPorDia ?? null;
    if (dia === null || max === null) return false;
    return this.slotsRecurrentes().filter(s => s.dia === dia).length >= max;
  });

  readonly limiteSemanaAlcanzado = computed(() => {
    const max = this.planContratado()?.maxClasesPorSemana ?? null;
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
    const dur      = this.duracionMasiva();
    const dia      = this.diaTemp();
    const fechaRef = dia !== null ? this.proximaFechaDia(dia) : '';
    const yaEnPlan = new Set(this.slotsRecurrentes().filter(s => s.dia === dia).map(s => s.horaInicio));
    return horas.map(hora => ({
      hora,
      ocupado:  generarSlots(fechaRef, hora, dur).some(s => ocupados.has(s)),
      yaEnPlan: yaEnPlan.has(hora),
    }));
  });

  readonly preview = computed(() => {
    const slots = this.slotsRecurrentes();
    const plan  = this.planContratado();
    if (slots.length === 0 || !plan || plan.clasesRestantes === 0) return null;
    const maxSemana = Math.min(this.maxPorSemana(), slots.length);
    const maxPorDia = plan.maxClasesPorDia ?? null;
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const monday    = this.mondayOfCurrentWeek();
    const porFecha  = new Map<string, number>();
    let remaining = plan.clasesRestantes;
    let week = 0;
    let fechaInicio: string | null = null;
    let fechaFin: string | null = null;
    let total = 0;
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
        total++;
      }
      week++;
    }
    return { total, semanas: week, fechaInicio, fechaFin };
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    const sucId = this.admin()?.sucursalId;
    if (sucId) this.sucursal.set(await this.sucursalService.getById(sucId));

    const alumnoId = this.route.snapshot.queryParamMap.get('alumnoId');
    if (alumnoId) {
      const alumno = await this.usuarioService.getByIdOnce(alumnoId);
      if (alumno) this.seleccionarAlumno(alumno);
    }
  }

  // ── Selección de alumno ────────────────────────────────────────────────────

  seleccionarAlumno(alumno: User): void {
    if (this.alumnoSeleccionado()?.uid === alumno.uid) return;
    this.alumnoSeleccionado.set(alumno);
    this.resetIndividual();
    this.resetMasiva();
    this.modo.set('individual');
  }

  cambiarModo(m: Modo): void {
    this.modo.set(m);
    this.resetIndividual();
  }

  // ── Modo individual ────────────────────────────────────────────────────────

  private resetIndividual(): void {
    this.fuenteSeleccionada.set(null);
    this.instructorSeleccionado.set(null);
    this.fechaSeleccionada.set(null);
    this.slotSeleccionado.set(null);
    this.slotsDelDia.set([]);
    this.semanaOffset.set(0);
  }

  seleccionarFuente(fuente: 'plan' | 'credito_individual'): void {
    this.fuenteSeleccionada.set(fuente);
    this.slotSeleccionado.set(null);
    this.slotsDelDia.set([]);
    const fecha = this.fechaSeleccionada();
    if (fecha && this.instructorSeleccionado()) this.cargarSlots(fecha);
  }

  async seleccionarInstructor(instructor: User): Promise<void> {
    this.instructorSeleccionado.set(instructor);
    this.fechaSeleccionada.set(null);
    this.slotSeleccionado.set(null);
    this.slotsDelDia.set([]);
  }

  private getFeriadoNombre(fechaStr: string): string | null {
    const mmdd = fechaStr.slice(5);
    return this.feriados().find(f => f.activo && (f.recurrente ? f.fecha.slice(5) === mmdd : f.fecha === fechaStr))?.nombre ?? null;
  }

  private getCierreMotivo(fechaStr: string): string | null {
    return this.cierres().find(c => c.activo && fechaStr >= c.fechaInicio && fechaStr <= c.fechaFin)?.motivo ?? null;
  }

  async seleccionarDia(dia: DiaCalendario): Promise<void> {
    if (dia.esPasado || !dia.esLaborable || !this.instructorSeleccionado()) return;
    this.fechaSeleccionada.set(dia.fechaStr);
    this.slotSeleccionado.set(null);
    await this.cargarSlots(dia.fechaStr);
  }

  private async cargarSlots(fechaStr: string): Promise<void> {
    const instructor = this.instructorSeleccionado();
    const suc        = this.sucursal();
    const alumno     = this.alumnoSeleccionado();
    if (!instructor || !suc || !alumno) return;
    const [y, mo, d] = fechaStr.split('-').map(Number);
    const horario = instructor.instructorData?.horariosDisponibles?.find(h => h.dia === new Date(y, mo - 1, d).getDay());
    if (!horario) { this.slotsDelDia.set([]); return; }
    const apertura = horario.horaInicio > suc.configuracionHorarios.horarioApertura ? horario.horaInicio : suc.configuracionHorarios.horarioApertura;
    const cierre   = horario.horaFin < suc.configuracionHorarios.horarioCierre       ? horario.horaFin   : suc.configuracionHorarios.horarioCierre;
    this.cierreEfectivo.set(cierre);
    this.loadingSlots.set(true);
    try {
      const [ocupados, misClasesMap] = await Promise.all([
        this.turnoService.getSlotsOcupados(instructor.uid, fechaStr),
        this.turnoService.getSlotsAlumnoConInstructor(alumno.uid, fechaStr),
      ]);
      this.misClasesMap.set(misClasesMap);
      const slotsAlumno = new Set(misClasesMap.keys());
      let slots = generarSlotsDia(fechaStr, apertura, cierre, this.duracionClaseIndividual(), ocupados, slotsAlumno);
      const hoy = dateToStr(new Date());
      if (fechaStr === hoy) {
        const ahora = new Date();
        const horaAhora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        slots = slots.map(s => s.horaInicio <= horaAhora ? { ...s, disponible: false } : s);
      }
      this.slotsDelDia.set(slots);
    } finally {
      this.loadingSlots.set(false);
    }
  }

  tooltipClaseAlumno(slot: SlotDisponible): string {
    if (!slot.esMiClase) return '';
    const fecha = this.fechaSeleccionada();
    if (!fecha) return '';
    const instUid = this.misClasesMap().get(slotKey(fecha, slot.horaInicio));
    const nombre  = instUid ? this.instructores().find(i => i.uid === instUid)?.nombre : null;
    return nombre ? `Clase del alumno con ${nombre}` : 'Clase del alumno';
  }

  esSlotSeleccionado(slot: SlotDisponible): boolean {
    const sel = this.slotSeleccionado();
    if (!sel) return false;
    return slot.horaInicio >= sel.horaInicio && slot.horaInicio < sel.horaFin;
  }

  async intentarSeleccionarSlot(slot: SlotDisponible): Promise<void> {
    if (!slot.disponible) return;
    if (!slot.puedeIniciar) {
      await Swal.fire({
        icon: 'warning', title: 'Horario fuera del turno',
        html: `La clase de <strong>${formatDuracion(this.duracionClaseIndividual())}</strong> terminaría a las <strong>${slot.horaFin}</strong>, pero el instructor trabaja hasta las <strong>${this.cierreEfectivo()}</strong>.<br><br>Elegí un horario más temprano.`,
        confirmButtonText: 'Entendido', confirmButtonColor: '#1a237e',
      });
      return;
    }
    this.slotSeleccionado.set(slot);
  }

  async confirmarTurno(): Promise<void> {
    const slot       = this.slotSeleccionado();
    const instructor = this.instructorSeleccionado();
    const fecha      = this.fechaSeleccionada();
    const alumno     = this.alumnoSeleccionado();
    if (!slot || !instructor || !fecha || !alumno) return;
    const result = await Swal.fire({
      title: 'Confirmar asignación',
      html: `<p><strong>Alumno:</strong> ${alumno.nombre}</p><p><strong>Fecha:</strong> ${strToDate(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p><p><strong>Horario:</strong> ${slot.horaInicio} - ${slot.horaFin}</p><p><strong>Instructor:</strong> ${instructor.nombre}</p><p><strong>Duración:</strong> ${formatDuracion(this.duracionClaseIndividual())}</p><p><small>La clase quedará <strong>confirmada</strong> directamente.</small></p>`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Asignar', cancelButtonText: 'Cancelar', confirmButtonColor: '#1a237e',
    });
    if (!result.isConfirmed) return;
    this.loading.set(true);
    try {
      const consumidoDe = this.fuenteEfectiva();
      await this.turnoService.crearTurno({
        alumnoUid: alumno.uid, instructorUid: instructor.uid, sucursalId: alumno.sucursalId,
        fecha: strToDate(fecha) as any, fechaStr: fecha,
        horaInicio: slot.horaInicio, duracionMinutos: this.duracionClaseIndividual(),
        estado: 'PENDIENTE_CONFIRMACION', tipoClase: consumidoDe === 'plan' ? 'plan' : 'individual',
        consumidoDe, asistenciaVerificada: false,
      }, true);
      const actualizado = await this.usuarioService.getByIdOnce(alumno.uid);
      this.alumnoSeleccionado.set(actualizado);
      this.slotSeleccionado.set(null);
      this.fechaSeleccionada.set(null);
      this.slotsDelDia.set([]);
      Swal.fire({ icon: 'success', title: '¡Clase agendada!', text: `Pendiente de confirmación por el instructor. ${alumno.nombre} — ${strToDate(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${slot.horaInicio}`, confirmButtonColor: '#1a237e' });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message ?? 'No se pudo asignar la clase.', confirmButtonColor: '#1a237e' });
    } finally {
      this.loading.set(false);
    }
  }

  // ── Modo masiva ────────────────────────────────────────────────────────────

  private resetMasiva(): void {
    this.slotsRecurrentes.set([]);
    this.instructorTemp.set(null);
    this.diaTemp.set(null);
    this.horaTemp.set(null);
    this.maxPorSemana.set(1);
    this.progreso.set(0);
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
    const existe = this.slotsRecurrentes().some(s => s.dia === dia && s.horaInicio === hora && s.instructor.uid === inst.uid);
    if (existe) return;
    const horaFin = calcularHoraFin(hora, this.duracionMasiva());
    this.slotsRecurrentes.update(s => [...s, { instructor: inst, dia, horaInicio: hora, horaFin }]);
    const nuevoLen = this.slotsRecurrentes().length;
    this.maxPorSemana.set(Math.min(nuevoLen, this.maxSemanaDelPlan()));
    this.diaTemp.set(null);
    this.horaTemp.set(null);

    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.slotAgregadoFeedback.set(`${DIAS_NOMBRES[dia]} ${hora} · ${inst.nombre}`);
    this.feedbackTimer = setTimeout(() => this.slotAgregadoFeedback.set(null), 3500);
  }

  setMaxPorSemana(val: number): void {
    this.maxPorSemana.set(Math.min(Math.max(this.minSemanaDelPlan(), val), this.maxSemanaDelPlan()));
  }

  quitarSlot(i: number): void {
    this.slotsRecurrentes.update(s => s.filter((_, idx) => idx !== i));
    const len = this.slotsRecurrentes().length;
    this.maxPorSemana.set(Math.max(1, Math.min(this.maxPorSemana(), len, this.maxSemanaDelPlan())));
  }

  async confirmarMasivo(): Promise<void> {
    const prev   = this.preview();
    const plan   = this.planContratado();
    const alumno = this.alumnoSeleccionado();
    if (!prev || !plan || !alumno || prev.total === 0) return;

    const fechaFinFmt = prev.fechaFin
      ? new Date(prev.fechaFin + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';

    const r = await Swal.fire({
      title: `Agendar ${prev.total} clases para ${alumno.nombre}`,
      html: `Se crearán <strong>${prev.total}</strong> clases en <strong>${prev.semanas}</strong> semanas, hasta el <strong>${fechaFinFmt}</strong>.<br><br>Las clases quedarán <strong>confirmadas</strong> directamente.`,
      icon: 'question', showCancelButton: true,
      confirmButtonText: 'Sí, agendar todas', cancelButtonText: 'Cancelar', confirmButtonColor: '#1a237e',
    });
    if (!r.isConfirmed) return;

    this.loading.set(true);
    this.progreso.set(0);

    const slots     = this.slotsRecurrentes();
    const maxSemana = Math.min(this.maxPorSemana(), slots.length);
    const today     = new Date(); today.setHours(0, 0, 0, 0);
    const monday    = this.mondayOfCurrentWeek();
    const duracion  = this.duracionMasiva();

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

    // ── Fase 1: validar disponibilidad ─────────────────────────────────────────
    const claveMap = new Map<string, Set<string>>();
    for (const t of planificados) {
      const clave = `${t.instructorUid}|${t.fechaStr}`;
      if (!claveMap.has(clave)) claveMap.set(clave, new Set());
      generarSlots(t.fechaStr, t.horaInicio, duracion).forEach(s => claveMap.get(clave)!.add(s));
    }
    const ocupadosMap = new Map<string, Set<string>>();
    await Promise.all([...claveMap.entries()].map(async ([clave]) => {
      const [instUid, fechaStr] = clave.split('|');
      ocupadosMap.set(clave, await this.turnoService.getSlotsOcupados(instUid, fechaStr));
    }));
    const alumnoSlotsPorFecha = new Map<string, Set<string>>();
    for (const t of planificados) {
      if (!alumnoSlotsPorFecha.has(t.fechaStr)) {
        alumnoSlotsPorFecha.set(t.fechaStr, await this.turnoService.getSlotsAlumno(alumno.uid, t.fechaStr));
      }
    }
    const conflictos: string[] = [];
    for (const t of planificados) {
      const clave = `${t.instructorUid}|${t.fechaStr}`;
      const ocupados   = ocupadosMap.get(clave) ?? new Set<string>();
      const propios    = alumnoSlotsPorFecha.get(t.fechaStr) ?? new Set<string>();
      const slotsTurno = generarSlots(t.fechaStr, t.horaInicio, duracion);
      const fechaFmt   = new Date(t.fechaStr + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (slotsTurno.some(s => ocupados.has(s))) {
        conflictos.push(`${fechaFmt} ${t.horaInicio} con ${t.instructorNombre} — horario ocupado`);
      } else if (slotsTurno.some(s => propios.has(s))) {
        conflictos.push(`${fechaFmt} ${t.horaInicio} — el alumno ya tiene una clase en ese horario`);
      }
    }
    if (conflictos.length > 0) {
      this.loading.set(false);
      await Swal.fire({
        icon: 'error', title: 'No se pudo agendar',
        html: `Los siguientes horarios no están disponibles. Corregí la configuración y volvé a intentarlo.<br><br><ul style="text-align:left;margin:0;padding-left:20px">${conflictos.map(c => `<li>${c}</li>`).join('')}</ul>`,
        confirmButtonColor: '#1a237e', confirmButtonText: 'Entendido',
      });
      this.progreso.set(0);
      return;
    }

    // ── Fase 2: crear turnos ──────────────────────────────────────────────────
    const total = planificados.length;
    let creados = 0;
    for (const t of planificados) {
      await this.turnoService.crearTurno({
        alumnoUid: alumno.uid, instructorUid: t.instructorUid,
        sucursalId: alumno.sucursalId, fecha: t.fecha as any,
        fechaStr: t.fechaStr, horaInicio: t.horaInicio,
        duracionMinutos: duracion, estado: 'PENDIENTE_CONFIRMACION',
        tipoClase: 'plan', consumidoDe: 'plan', asistenciaVerificada: false,
      }, true);
      creados++;
      this.progreso.set(Math.round(creados / total * 100));
    }

    this.loading.set(false);
    const actualizado = await this.usuarioService.getByIdOnce(alumno.uid);
    this.alumnoSeleccionado.set(actualizado);

    await Swal.fire({
      icon: 'success',
      title: `${creados} clase${creados !== 1 ? 's' : ''} agendada${creados !== 1 ? 's' : ''}`,
      text: `Todas las clases de ${alumno.nombre} fueron asignadas exitosamente.`,
      confirmButtonColor: '#1a237e',
    });

    this.resetMasiva();
  }

  // ── Utilidades de fecha ────────────────────────────────────────────────────

  private mondayOfCurrentWeek(): Date {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const offset = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - offset);
    return monday;
  }

  private dateForSlot(monday: Date, weekOffset: number, dia: number): Date {
    const daysFromMonday = dia === 0 ? 6 : dia - 1;
    const date = new Date(monday);
    date.setDate(monday.getDate() + weekOffset * 7 + daysFromMonday);
    return date;
  }
}

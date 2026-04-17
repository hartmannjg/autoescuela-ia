import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
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
import { dateToStr, strToDate, generarSlots, calcularHoraFin, slotKey } from '../../../shared/utils/date-utils';
import { DuracionPipe, formatDuracion } from '../../../shared/pipes/duracion.pipe';
import { DisponibilidadGridComponent } from '../../../shared/components/disponibilidad-grid/disponibilidad-grid.component';

interface DiaCalendario {
  fecha: Date;
  fechaStr: string;
  esHoy: boolean;
  esPasado: boolean;
  esLaborable: boolean;
  feriadoNombre: string | null;
  cierreMotivo: string | null;
}

@Component({
  selector: 'app-alumno-calendario',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatFormFieldModule, MatProgressSpinnerModule, MatTooltipModule,
    MatChipsModule, MatDividerModule, DuracionPipe, DisponibilidadGridComponent,
  ],
  templateUrl: './calendario.component.html',
  styleUrl: './calendario.component.scss',
})
export class AlumnoCalendarioComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private usuarioService = inject(UsuarioService);
  private sucursalService = inject(SucursalService);
  private feriadoService  = inject(FeriadoService);
  private cierreService   = inject(CierreService);

  readonly user = this.authService.currentUser;
  readonly pagModo = signal<'agendar' | 'disponibilidad'>('agendar');
  readonly loading = signal(false);
  readonly loadingSlots = signal(false);

  readonly semanaOffset = signal(0);
  readonly fechaSeleccionada = signal<string | null>(null);
  readonly instructorSeleccionado = signal<User | null>(null);

  readonly instructores = toSignal(
    this.usuarioService.instructoresActivos$(this.user()?.sucursalId ?? ''),
    { initialValue: [] as User[] }
  );

  readonly sucursal = signal<Sucursal | null>(null);

  private readonly sucursalId = this.user()?.sucursalId ?? '';
  readonly feriados = toSignal(this.feriadoService.feriados$(this.sucursalId), { initialValue: [] });
  readonly cierres  = toSignal(this.cierreService.cierres$(this.sucursalId),   { initialValue: [] });

  readonly slotsDelDia = signal<SlotDisponible[]>([]);
  readonly slotSeleccionado = signal<SlotDisponible | null>(null);
  /** Hora de cierre efectiva del instructor en el día cargado (para mostrar en el popup). */
  private readonly cierreEfectivo = signal<string>('');
  /** Map slotKey → instructorUid para los slots propios del día cargado. */
  private readonly misClasesMap = signal<Map<string, string>>(new Map());

  readonly diasSemana = computed(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - hoy.getDay() + 1 + this.semanaOffset() * 7); // Lunes

    const diasLabSucursal = this.sucursal()?.configuracionHorarios.diasLaborales ?? [1,2,3,4,5,6];
    const diasLabInstructor = this.instructorSeleccionado()
      ?.instructorData?.horariosDisponibles?.map(h => h.dia) ?? null;

    return Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + i);
      const fechaStr = dateToStr(fecha);
      const diaSemana = fecha.getDay();
      const feriadoNombre = this.getFeriadoNombre(fechaStr);
      const cierreMotivo  = feriadoNombre ? null : this.getCierreMotivo(fechaStr);
      const esLaborable = diasLabSucursal.includes(diaSemana) &&
        (diasLabInstructor === null || diasLabInstructor.includes(diaSemana)) &&
        !feriadoNombre && !cierreMotivo;
      return {
        fecha,
        fechaStr,
        esHoy: dateToStr(fecha) === dateToStr(hoy),
        esPasado: fecha < hoy,
        esLaborable,
        feriadoNombre,
        cierreMotivo,
      } as DiaCalendario;
    });
  });

  readonly semanaLabel = computed(() => {
    const dias = this.diasSemana();
    const inicio = dias[0].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    const fin = dias[6].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${inicio} - ${fin}`;
  });

  // ── Fuente de saldo ─────────────────────────────────────────────────────────

  readonly fuenteSeleccionada = signal<'plan' | 'credito_individual' | null>(null);
  readonly duracionIndividual  = signal<40 | null>(null);

  private readonly tienePlan = computed(() => {
    const p = this.user()?.alumnoData?.planContratado;
    return !!(p && p.clasesRestantes > 0);
  });

  private readonly tieneCredito = computed(() =>
    (this.user()?.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0) > 0
  );

  /** Mostrar selector sólo si el alumno tiene AMBAS opciones disponibles. */
  readonly debeMostrarSelectorFuente = computed(() => this.tienePlan() && this.tieneCredito());

  /** Fuente efectiva: auto si hay una sola opción, selección del alumno (default plan) si hay ambas. */
  readonly fuenteEfectiva = computed((): 'plan' | 'credito_individual' => {
    if (!this.tieneCredito()) return 'plan';
    if (!this.tienePlan())    return 'credito_individual';
    return this.fuenteSeleccionada() ?? 'plan';
  });

  readonly usaPlan = computed(() => this.fuenteEfectiva() === 'plan');

  readonly duracionesIndividualesDisponibles = computed((): Array<40> => {
    const ind = this.user()?.alumnoData?.creditoIndividual;
    if (!ind || ind.clasesDisponibles <= 0) return [];
    return [40];
  });

  readonly duracionClase = computed((): 40 | 80 => {
    if (this.usaPlan()) {
      return this.user()?.alumnoData?.planContratado?.duracionClase ?? 40;
    }
    return 40; // individual siempre 40 min
  });

  readonly duracionSeleccionadaOk = computed(() =>
    this.usaPlan() ||
    this.duracionesIndividualesDisponibles().length === 1 ||
    this.duracionIndividual() !== null
  );

  // ── Numeración de pasos dinámica ─────────────────────────────────────────────

  readonly stepNumDuracion  = computed(() => this.debeMostrarSelectorFuente() ? 2 : 1);
  readonly stepNumInstructor = computed(() => {
    let n = 1;
    if (this.debeMostrarSelectorFuente()) n++;
    if (!this.usaPlan() && this.duracionesIndividualesDisponibles().length > 1) n++;
    return n;
  });
  readonly stepNumDia      = computed(() => this.stepNumInstructor() + 1);
  readonly stepNumHorario  = computed(() => this.stepNumDia() + 1);

  async ngOnInit(): Promise<void> {
    const sucId = this.user()?.sucursalId;
    if (sucId) {
      const s = await this.sucursalService.getById(sucId);
      this.sucursal.set(s);
    }
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

  clasesIndividualesPorDuracion(_dur: 40): number {
    return this.user()?.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0;
  }

  seleccionarFuente(fuente: 'plan' | 'credito_individual'): void {
    this.fuenteSeleccionada.set(fuente);
    this.duracionIndividual.set(null);
    this.slotSeleccionado.set(null);
    this.slotsDelDia.set([]);
    const fecha = this.fechaSeleccionada();
    if (fecha && this.instructorSeleccionado()) this.cargarSlots(fecha);
  }

  seleccionarDuracionIndividual(dur: 40): void {
    this.duracionIndividual.set(dur);
    // Limpiar selecciones dependientes para recalcular slots con nueva duración
    this.slotSeleccionado.set(null);
    this.slotsDelDia.set([]);
    const fecha = this.fechaSeleccionada();
    if (fecha && this.instructorSeleccionado()) this.cargarSlots(fecha);
  }

  async seleccionarInstructor(instructor: User): Promise<void> {
    this.instructorSeleccionado.set(instructor);
    this.slotSeleccionado.set(null);
    this.slotsDelDia.set([]);
    const fecha = this.fechaSeleccionada();
    if (fecha) await this.cargarSlots(fecha);
  }

  private async cargarSlots(fechaStr: string): Promise<void> {
    const instructor = this.instructorSeleccionado();
    const suc = this.sucursal();
    if (!instructor || !suc) return;

    // Día de la semana del fecha seleccionada (0=Dom, 1=Lun, ...)
    const [y, mo, d] = fechaStr.split('-').map(Number);
    const diaSemana = new Date(y, mo - 1, d).getDay();

    // Verificar que el instructor trabaja ese día
    const horarioInstructor = instructor.instructorData?.horariosDisponibles
      ?.find(h => h.dia === diaSemana);

    if (!horarioInstructor) {
      this.slotsDelDia.set([]);
      return;
    }

    // El rango efectivo es la intersección entre sucursal e instructor
    const apertura = horarioInstructor.horaInicio > suc.configuracionHorarios.horarioApertura
      ? horarioInstructor.horaInicio
      : suc.configuracionHorarios.horarioApertura;
    const cierre = horarioInstructor.horaFin < suc.configuracionHorarios.horarioCierre
      ? horarioInstructor.horaFin
      : suc.configuracionHorarios.horarioCierre;

    this.cierreEfectivo.set(cierre);
    this.loadingSlots.set(true);
    try {
      const [ocupados, misClasesMap] = await Promise.all([
        this.turnoService.getSlotsOcupados(instructor.uid, fechaStr),
        this.turnoService.getSlotsAlumnoConInstructor(this.user()!.uid, fechaStr),
      ]);
      this.misClasesMap.set(misClasesMap);
      const slotsAlumno = new Set(misClasesMap.keys());
      let slots = generarSlotsDia(fechaStr, apertura, cierre, this.duracionClase(), ocupados, slotsAlumno);

      // Si es hoy, descartar slots cuyo inicio ya pasó
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

  /** Devuelve el tooltip para un slot propio del alumno ("Mi clase con <Instructor>"). */
  tooltipMiClase(slot: SlotDisponible): string {
    if (!slot.esMiClase) return '';
    const fecha = this.fechaSeleccionada();
    if (!fecha) return '';
    const instUid = this.misClasesMap().get(slotKey(fecha, slot.horaInicio));
    if (!instUid) return 'Mi clase';
    const nombre = this.instructores().find(i => i.uid === instUid)?.nombre;
    return nombre ? `Mi clase con ${nombre}` : 'Mi clase';
  }

  /** Devuelve true si el slot cae dentro del rango de la clase seleccionada. */
  esSlotSeleccionado(slot: SlotDisponible): boolean {
    const sel = this.slotSeleccionado();
    if (!sel) return false;
    return slot.horaInicio >= sel.horaInicio && slot.horaInicio < sel.horaFin;
  }

  async intentarSeleccionarSlot(slot: SlotDisponible): Promise<void> {
    if (!slot.disponible) return;
    if (!slot.puedeIniciar) {
      await Swal.fire({
        icon: 'warning',
        title: 'Horario fuera del turno',
        html: `La clase de <strong>${formatDuracion(this.duracionClase())}</strong> terminaría a las <strong>${slot.horaFin}</strong>, pero el instructor trabaja hasta las <strong>${this.cierreEfectivo()}</strong>.<br><br>Elegí un horario más temprano.`,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#1a237e',
      });
      return;
    }
    this.slotSeleccionado.set(slot);
  }

  async confirmarTurno(): Promise<void> {
    const slot = this.slotSeleccionado();
    const instructor = this.instructorSeleccionado();
    const fecha = this.fechaSeleccionada();
    const user = this.user();

    if (!slot || !instructor || !fecha || !user) return;

    const alumnoData = user.alumnoData;
    if (!alumnoData) return;

    const result = await Swal.fire({
      title: 'Confirmar clase',
      html: `
        <p><strong>Fecha:</strong> ${strToDate(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
        <p><strong>Horario:</strong> ${slot.horaInicio} - ${slot.horaFin}</p>
        <p><strong>Instructor:</strong> ${instructor.nombre}</p>
        <p><strong>Duración:</strong> ${formatDuracion(this.duracionClase())}</p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, agendar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#1a237e',
    });

    if (!result.isConfirmed) return;

    this.loading.set(true);
    try {
      const consumidoDe = this.fuenteEfectiva();
      const tipoClase   = consumidoDe === 'plan' ? 'plan' : 'individual';

      await this.turnoService.crearTurno({
        alumnoUid: user.uid,
        instructorUid: instructor.uid,
        sucursalId: user.sucursalId,
        fecha: strToDate(fecha) as any,
        fechaStr: fecha,
        horaInicio: slot.horaInicio,
        duracionMinutos: this.duracionClase(),
        estado: 'PENDIENTE_CONFIRMACION',
        tipoClase,
        consumidoDe,
        asistenciaVerificada: false,
      });

      this.slotSeleccionado.set(null);
      this.fechaSeleccionada.set(null);
      this.slotsDelDia.set([]);

      // Refresca el saldo del usuario en el signal global
      await this.authService.recargarUsuario();

      Swal.fire({ icon: 'success', title: '¡Clase agendada!', text: 'El instructor recibirá tu solicitud y la confirmará pronto.', confirmButtonColor: '#1a237e' });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message ?? 'No se pudo agendar la clase.', confirmButtonColor: '#1a237e' });
    } finally {
      this.loading.set(false);
    }
  }
}

import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { User, Sucursal } from '../../../shared/models';
import { generarSlotsDia, SlotDisponible } from '../../../shared/utils/slot-utils';
import { dateToStr, strToDate, generarSlots, calcularHoraFin } from '../../../shared/utils/date-utils';

interface DiaCalendario {
  fecha: Date;
  fechaStr: string;
  esHoy: boolean;
  esPasado: boolean;
  esLaborable: boolean;
}

@Component({
  selector: 'app-alumno-calendario',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatSelectModule,
    MatFormFieldModule, MatProgressSpinnerModule, MatTooltipModule,
    MatChipsModule, MatDividerModule,
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

  readonly user = this.authService.currentUser;
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
  readonly slotsDelDia = signal<SlotDisponible[]>([]);
  readonly slotSeleccionado = signal<SlotDisponible | null>(null);

  readonly diasSemana = computed(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - hoy.getDay() + 1 + this.semanaOffset() * 7); // Lunes

    return Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + i);
      const fechaStr = dateToStr(fecha);
      const diasLab = this.sucursal()?.configuracionHorarios.diasLaborales ?? [1,2,3,4,5,6];
      return {
        fecha,
        fechaStr,
        esHoy: dateToStr(fecha) === dateToStr(hoy),
        esPasado: fecha < hoy,
        esLaborable: diasLab.includes(fecha.getDay()),
      } as DiaCalendario;
    });
  });

  readonly semanaLabel = computed(() => {
    const dias = this.diasSemana();
    const inicio = dias[0].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    const fin = dias[6].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${inicio} - ${fin}`;
  });

  readonly duracionClase = computed(() => {
    const plan = this.user()?.alumnoData?.planContratado;
    return plan?.duracionClaseMinutos ?? 30;
  });

  async ngOnInit(): Promise<void> {
    const sucId = this.user()?.sucursalId;
    if (sucId) {
      const s = await this.sucursalService.getById(sucId);
      this.sucursal.set(s);
    }
  }

  async seleccionarDia(dia: DiaCalendario): Promise<void> {
    if (dia.esPasado || !dia.esLaborable || !this.instructorSeleccionado()) return;
    this.fechaSeleccionada.set(dia.fechaStr);
    this.slotSeleccionado.set(null);
    await this.cargarSlots(dia.fechaStr);
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

    this.loadingSlots.set(true);
    try {
      const ocupados = await this.turnoService.getSlotsOcupados(instructor.uid, fechaStr);
      const slots = generarSlotsDia(
        fechaStr,
        suc.configuracionHorarios.horarioApertura,
        suc.configuracionHorarios.horarioCierre,
        this.duracionClase(),
        ocupados
      );
      this.slotsDelDia.set(slots);
    } finally {
      this.loadingSlots.set(false);
    }
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
        <p><strong>Fecha:</strong> ${strToDate(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        <p><strong>Horario:</strong> ${slot.horaInicio} - ${slot.horaFin}</p>
        <p><strong>Instructor:</strong> ${instructor.nombre}</p>
        <p><strong>Duración:</strong> ${this.duracionClase()} minutos</p>
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
      const consumidoDe = alumnoData.planContratado && alumnoData.planContratado.clasesRestantes > 0
        ? 'plan' : 'credito_individual';
      const tipoClase = consumidoDe === 'plan' ? 'plan' : 'individual';

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

      Swal.fire({ icon: 'success', title: '¡Clase agendada!', text: 'El instructor recibirá tu solicitud y la confirmará pronto.', confirmButtonColor: '#1a237e' });
    } catch (error: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: error.message ?? 'No se pudo agendar la clase.', confirmButtonColor: '#1a237e' });
    } finally {
      this.loading.set(false);
    }
  }
}

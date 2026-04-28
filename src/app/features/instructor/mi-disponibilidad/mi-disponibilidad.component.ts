import { Component, inject, signal, computed, effect, untracked } from '@angular/core';
import { tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { Timestamp } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { AusenciaService } from '../../../core/services/ausencia.service';
import { InstructorAusencia, TipoAusencia, HorarioDisponible, HorarioEspecifico } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { dateToStr, SLOT_INTERVAL } from '../../../shared/utils/date-utils';

interface DiaConSlots {
  fechaStr: string;
  nombre: string;
  horas: string[];
}

@Component({
  selector: 'app-mi-disponibilidad',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule, MatSlideToggleModule,
    MatChipsModule, MatProgressSpinnerModule, MatDividerModule, FechaHoraPipe,
  ],
  templateUrl: './mi-disponibilidad.component.html',
  styleUrl: './mi-disponibilidad.component.scss',
})
export class MiDisponibilidadComponent {
  private authService    = inject(AuthService);
  private ausenciaService = inject(AusenciaService);
  private fb = inject(FormBuilder);

  readonly loading     = signal(false);
  readonly loadingData = signal(true);
  readonly user        = this.authService.currentUser;
  readonly hoy         = new Date();
  readonly horarios: HorarioDisponible[] = this.user()?.instructorData?.horariosDisponibles ?? [];

  readonly ausencias = toSignal(
    this.ausenciaService.ausenciasInstructor$(this.user()?.uid ?? '')
      .pipe(tap(() => this.loadingData.set(false))),
    { initialValue: [] as InstructorAusencia[] }
  );

  readonly tiposAusencia: { value: TipoAusencia; label: string; icon: string }[] = [
    { value: 'vacaciones', label: 'Vacaciones', icon: 'beach_access' },
    { value: 'licencia',   label: 'Licencia',   icon: 'card_travel' },
    { value: 'enfermedad', label: 'Enfermedad', icon: 'sick' },
    { value: 'tramite',    label: 'Trámite',    icon: 'description' },
    { value: 'otro',       label: 'Otro',       icon: 'event_busy' },
  ];

  form = this.fb.group({
    tipo:             ['vacaciones' as TipoAusencia, Validators.required],
    fechaInicio:      [null as Date | null, Validators.required],
    fechaFin:         [null as Date | null, Validators.required],
    diaCompleto:      [true],
    motivo:           ['', Validators.required],
    notificarAlumnos: [true],
  });

  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  // ── Selector de horarios parciales ────────────────────────────────────────
  readonly horasAusentes = signal<Map<string, Set<string>>>(new Map());

  readonly diasEnRango = computed((): DiaConSlots[] => {
    const v = this.formValue();
    if (!v.fechaInicio || !v.fechaFin || v.diaCompleto) return [];
    const inicio = new Date(v.fechaInicio);
    const fin    = new Date(v.fechaFin);
    if (fin < inicio) return [];
    const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const resultado: DiaConSlots[] = [];
    const cursor = new Date(inicio);
    while (cursor <= fin) {
      const horario = this.horarios.find(h => h.dia === cursor.getDay());
      if (horario) {
        resultado.push({
          fechaStr: dateToStr(cursor),
          nombre:   `${DIAS[cursor.getDay()]} ${cursor.getDate()}/${cursor.getMonth() + 1}`,
          horas:    this.generarHorasDia(horario),
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return resultado;
  });

  constructor() {
    effect(() => {
      const fechasValidas = new Set(this.diasEnRango().map(d => d.fechaStr));
      untracked(() => {
        this.horasAusentes.update(m => {
          const newMap = new Map<string, Set<string>>();
          fechasValidas.forEach(f => { if (m.has(f)) newMap.set(f, m.get(f)!); });
          return newMap;
        });
      });
    });
  }

  private generarHorasDia(h: HorarioDisponible): string[] {
    const horas: string[] = [];
    const [hh, mm] = h.horaInicio.split(':').map(Number);
    let total = hh * 60 + mm;
    const [hf, mf] = h.horaFin.split(':').map(Number);
    const finMin = hf * 60 + mf;
    while (total < finMin) {
      horas.push(`${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`);
      total += SLOT_INTERVAL;
    }
    return horas;
  }

  toggleHora(fechaStr: string, hora: string): void {
    this.horasAusentes.update(m => {
      const newMap = new Map(m);
      const set = new Set(newMap.get(fechaStr) ?? []);
      if (set.has(hora)) set.delete(hora); else set.add(hora);
      newMap.set(fechaStr, set);
      return newMap;
    });
  }

  toggleDia(fechaStr: string, horas: string[]): void {
    this.horasAusentes.update(m => {
      const newMap = new Map(m);
      const set = newMap.get(fechaStr);
      newMap.set(fechaStr, (set && set.size === horas.length) ? new Set() : new Set(horas));
      return newMap;
    });
  }

  horaSeleccionada(fechaStr: string, hora: string): boolean {
    return this.horasAusentes().get(fechaStr)?.has(hora) ?? false;
  }

  diaCompletoSel(fechaStr: string, horas: string[]): boolean {
    const s = this.horasAusentes().get(fechaStr);
    return !!s && horas.length > 0 && s.size === horas.length;
  }

  cantSel(fechaStr: string): number {
    return this.horasAusentes().get(fechaStr)?.size ?? 0;
  }

  readonly haySlotSeleccionado = computed(() =>
    this.diasEnRango().some(d => this.cantSel(d.fechaStr) > 0)
  );

  // ── Submit ────────────────────────────────────────────────────────────────
  async registrarAusencia(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.value;
    const inicio = v.fechaInicio!;
    const fin    = v.fechaFin!;

    if (fin < inicio) {
      Swal.fire({ icon: 'error', title: 'Fechas inválidas', text: 'La fecha de fin no puede ser anterior al inicio.' });
      return;
    }
    if (!v.diaCompleto && !this.haySlotSeleccionado()) {
      Swal.fire({ icon: 'warning', title: 'Sin horarios marcados', text: 'Seleccioná al menos un slot para marcar como ausente.' });
      return;
    }

    this.loading.set(true);
    try {
      let horarioEspecifico: HorarioEspecifico[] | undefined;
      if (!v.diaCompleto) {
        horarioEspecifico = this.diasEnRango()
          .filter(d => this.cantSel(d.fechaStr) > 0)
          .map(d => ({
            fecha: d.fechaStr,
            horas: [...(this.horasAusentes().get(d.fechaStr) ?? [])].sort(),
          }));
      }

      await this.ausenciaService.crear({
        instructorUid:    this.user()!.uid,
        sucursalId:       this.user()!.sucursalId ?? '',
        tipo:             v.tipo!,
        fechaInicio:      Timestamp.fromDate(inicio),
        fechaFin:         Timestamp.fromDate(fin),
        diaCompleto:      v.diaCompleto ?? true,
        motivo:           v.motivo!,
        ...(horarioEspecifico ? { horarioEspecifico } : {}),
        estado:           'pendiente',
        notificarAlumnos: v.notificarAlumnos ?? true,
      });

      this.form.reset({ tipo: 'vacaciones', diaCompleto: true, notificarAlumnos: true });
      this.horasAusentes.set(new Map());
      Swal.fire({ icon: 'success', title: 'Ausencia registrada', text: 'Quedará pendiente de aprobación.', timer: 2200, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.loading.set(false);
    }
  }

  getTipoIcon(tipo: TipoAusencia): string {
    return this.tiposAusencia.find(t => t.value === tipo)?.icon ?? 'event_busy';
  }

  getTipoLabel(tipo: TipoAusencia): string {
    return this.tiposAusencia.find(t => t.value === tipo)?.label ?? tipo;
  }
}

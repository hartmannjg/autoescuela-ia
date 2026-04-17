import { Component, inject, signal, computed, input, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TurnoService } from '../../../core/services/turno.service';
import { FeriadoService } from '../../../core/services/feriado.service';
import { CierreService } from '../../../core/services/cierre.service';
import { User, Sucursal } from '../../models';
import { firstValueFrom } from 'rxjs';
import { generarSlotsDia } from '../../utils/slot-utils';
import { dateToStr } from '../../utils/date-utils';

interface DiaCalendario {
  fecha: Date;
  fechaStr: string;
  esHoy: boolean;
  esPasado: boolean;
  esLaborable: boolean;
}

interface SlotDisp {
  horaInicio: string;
  horaFin: string;
  disponible: boolean;
  esPasado: boolean;
}

@Component({
  selector: 'app-disponibilidad-grid',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule, MatIconModule,
    MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './disponibilidad-grid.component.html',
  styleUrl: './disponibilidad-grid.component.scss',
})
export class DisponibilidadGridComponent {
  private turnoService   = inject(TurnoService);
  private feriadoService = inject(FeriadoService);
  private cierreService  = inject(CierreService);

  readonly sucursal     = input<Sucursal | null>(null);
  readonly instructores = input<User[]>([]);

  readonly semanaOffset   = signal(0);

  private readonly feriados = signal<any[]>([]);
  private readonly cierres  = signal<any[]>([]);
  readonly loadingDisp    = signal(false);
  readonly dispData       = signal<Map<string, SlotDisp[]>>(new Map());
  readonly celdaExpandida = signal<string | null>(null);

  constructor() {
    // Auto-load when both inputs are ready
    effect(() => {
      const insts = this.instructores();
      const suc   = this.sucursal();
      if (insts.length > 0 && suc) {
        untracked(() => {
          if (this.dispData().size === 0 && !this.loadingDisp()) {
            this.cargar();
          }
        });
      }
    });
  }

  readonly diasSemana = computed(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - hoy.getDay() + 1 + this.semanaOffset() * 7);
    const diasLab = this.sucursal()?.configuracionHorarios.diasLaborales ?? [1, 2, 3, 4, 5, 6];
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + i);
      return {
        fecha,
        fechaStr: dateToStr(fecha),
        esHoy:      dateToStr(fecha) === dateToStr(hoy),
        esPasado:   fecha < hoy,
        esLaborable: diasLab.includes(fecha.getDay()) &&
          !this.feriadoService.esFeriado(dateToStr(fecha), this.feriados()) &&
          !this.cierreService.estaEnCierre(dateToStr(fecha), this.cierres()),
      } as DiaCalendario;
    });
  });

  readonly semanaLabel = computed(() => {
    const dias = this.diasSemana();
    const ini  = dias[0].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    const fin  = dias[6].fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${ini} - ${fin}`;
  });

  async cambiarSemana(delta: number): Promise<void> {
    this.semanaOffset.update(v => v + delta);
    this.celdaExpandida.set(null);
    this.dispData.set(new Map());
    await this.cargar();
  }

  async cargar(): Promise<void> {
    const insts = this.instructores();
    const dias  = this.diasSemana();
    const suc   = this.sucursal();
    if (!suc || insts.length === 0) return;

    this.loadingDisp.set(true);
    const sucId = suc.id ?? '';
    const [feriados, cierres] = await Promise.all([
      firstValueFrom(this.feriadoService.feriados$(sucId)),
      firstValueFrom(this.cierreService.cierres$(sucId)),
    ]);
    this.feriados.set(feriados);
    this.cierres.set(cierres);
    const newMap = new Map<string, SlotDisp[]>();
    const ahora     = new Date();
    const horaAhora = `${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;

    const tasks: Promise<void>[] = [];
    for (const inst of insts) {
      for (const dia of dias) {
        if (!dia.esLaborable) continue;
        const horario = inst.instructorData?.horariosDisponibles?.find(h => h.dia === dia.fecha.getDay());
        if (!horario) continue;
        const apertura = horario.horaInicio > suc.configuracionHorarios.horarioApertura
          ? horario.horaInicio : suc.configuracionHorarios.horarioApertura;
        const cierre = horario.horaFin < suc.configuracionHorarios.horarioCierre
          ? horario.horaFin : suc.configuracionHorarios.horarioCierre;
        const key = `${inst.uid}|${dia.fechaStr}`;
        tasks.push((async () => {
          const ocupados = await this.turnoService.getSlotsOcupados(inst.uid, dia.fechaStr);
          const raw = generarSlotsDia(dia.fechaStr, apertura, cierre, 40, ocupados, new Set());
          newMap.set(key, raw.map(s => ({
            horaInicio: s.horaInicio,
            horaFin:    s.horaFin,
            disponible: s.disponible,
            esPasado:   dia.esPasado || (dia.esHoy && s.horaInicio <= horaAhora),
          })));
        })());
      }
    }

    await Promise.all(tasks);
    this.dispData.set(newMap);
    this.loadingDisp.set(false);
  }

  getCeldaSlots(instUid: string, fechaStr: string): SlotDisp[] {
    return this.dispData().get(`${instUid}|${fechaStr}`) ?? [];
  }

  contarLibres(instUid: string, fechaStr: string): number {
    return this.getCeldaSlots(instUid, fechaStr).filter(s => s.disponible && !s.esPasado).length;
  }

  esCeldaTodoOcupado(instUid: string, fechaStr: string): boolean {
    const nonPast = this.getCeldaSlots(instUid, fechaStr).filter(s => !s.esPasado);
    return nonPast.length > 0 && nonPast.every(s => !s.disponible);
  }

  diaLaboralParaInst(inst: User, dia: DiaCalendario): boolean {
    if (!dia.esLaborable) return false;
    return (inst.instructorData?.horariosDisponibles ?? []).some(h => h.dia === dia.fecha.getDay());
  }

  toggleCelda(key: string, laboral: boolean, instUid: string, fechaStr: string): void {
    if (!laboral) return;
    if (this.esCeldaTodoOcupado(instUid, fechaStr)) return; // all red → no expand
    this.celdaExpandida.update(v => v === key ? null : key);
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { Firestore, collection, getDocs, query, where } from '@angular/fire/firestore';
import { AuthService } from '../../../core/services/auth.service';
import { FeriadoService } from '../../../core/services/feriado.service';
import { CierreService } from '../../../core/services/cierre.service';
import { TurnoService } from '../../../core/services/turno.service';
import { Feriado, TipoFeriado, Cierre } from '../../../shared/models';
import { dateToStr } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-feriados',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTooltipModule, MatProgressSpinnerModule,
    MatSlideToggleModule, MatDividerModule, MatDatepickerModule, MatNativeDateModule, MatCheckboxModule,
  ],
  templateUrl: './feriados.component.html',
  styleUrl: './feriados.component.scss',
})
export class FeriadosComponent {
  private authService    = inject(AuthService);
  private feriadoService = inject(FeriadoService);
  private cierreService  = inject(CierreService);
  private turnoService   = inject(TurnoService);
  private firestore      = inject(Firestore);
  private fb = inject(FormBuilder);

  readonly sucursalId  = this.authService.currentUser()?.sucursalId ?? '';
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly loading = signal(true);
  readonly guardando = signal(false);

  // ── Feriados ────────────────────────────────────────────────────────────────
  readonly feriados = toSignal(
    this.feriadoService.todos$().pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as Feriado[] }
  );

  readonly feriadosGlobales = computed(() =>
    this.feriados().filter(f => f.tipo !== 'sucursal').sort((a, b) => a.fecha.localeCompare(b.fecha))
  );

  readonly feriadosSucursal = computed(() =>
    this.feriados().filter(f => f.tipo === 'sucursal' && f.sucursalId === this.sucursalId)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  );

  readonly mostrarFormGlobal   = signal(false);
  readonly mostrarFormSucursal = signal(false);

  readonly tiposGlobalesOptions: { value: TipoFeriado; label: string }[] = [
    { value: 'nacional',   label: 'Nacional' },
    { value: 'provincial', label: 'Provincial' },
  ];

  formGlobal = this.fb.group({
    nombre:     ['', [Validators.required, Validators.minLength(3)]],
    fecha:      [null as Date | null, Validators.required],
    tipo:       ['nacional' as TipoFeriado, Validators.required],
    recurrente: [true],
  });

  formSucursal = this.fb.group({
    nombre:     ['', [Validators.required, Validators.minLength(3)]],
    fecha:      [null as Date | null, Validators.required],
    recurrente: [false],
  });

  estaExcluido(f: Feriado): boolean {
    return (f.excluido_en ?? []).includes(this.sucursalId);
  }

  async toggleExclusion(f: Feriado): Promise<void> {
    if (this.estaExcluido(f)) {
      await this.feriadoService.reincluirEnSucursal(f.id!, this.sucursalId);
    } else {
      await this.feriadoService.excluirEnSucursal(f.id!, this.sucursalId);
    }
  }

  async guardarGlobal(): Promise<void> {
    if (this.formGlobal.invalid) return;
    const v = this.formGlobal.value;
    this.guardando.set(true);
    try {
      const fechaStr = dateToStr(v.fecha!);
      await this.feriadoService.crear({
        nombre: v.nombre!, fecha: fechaStr,
        tipo: v.tipo!, recurrente: v.recurrente ?? false, activo: true,
      });
      this.formGlobal.reset({ tipo: 'nacional', recurrente: true });
      this.mostrarFormGlobal.set(false);
      await this.ofrecerCancelarTurnos([fechaStr], v.nombre!, undefined);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally { this.guardando.set(false); }
  }

  async guardarSucursal(): Promise<void> {
    if (this.formSucursal.invalid) return;
    const v = this.formSucursal.value;
    this.guardando.set(true);
    try {
      const fechaStr = dateToStr(v.fecha!);
      await this.feriadoService.crear({
        nombre: v.nombre!, fecha: fechaStr,
        tipo: 'sucursal', sucursalId: this.sucursalId,
        recurrente: v.recurrente ?? false, activo: true,
      });
      this.formSucursal.reset({ recurrente: false });
      this.mostrarFormSucursal.set(false);
      await this.ofrecerCancelarTurnos([fechaStr], v.nombre!, this.sucursalId);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally { this.guardando.set(false); }
  }

  async eliminarFeriado(f: Feriado): Promise<void> {
    const conf = await Swal.fire({
      icon: 'warning', title: '¿Eliminar feriado?', text: `${f.nombre} — ${f.fecha}`,
      showCancelButton: true, confirmButtonText: 'Eliminar', confirmButtonColor: '#c62828',
    });
    if (conf.isConfirmed) await this.feriadoService.eliminar(f.id!);
  }

  async toggleActivo(f: Feriado): Promise<void> {
    await this.feriadoService.toggleActivo(f.id!, !f.activo);
  }

  getTipoLabel(tipo: TipoFeriado): string {
    const map: Record<TipoFeriado, string> = { nacional: 'Nacional', provincial: 'Provincial', sucursal: 'Esta sucursal' };
    return map[tipo] ?? tipo;
  }

  cantidadExcluidas(f: Feriado): number {
    return (f.excluido_en ?? []).length;
  }

  // ── Cierres temporales ──────────────────────────────────────────────────────
  readonly cierres = toSignal(
    this.cierreService.todos$(),
    { initialValue: [] as Cierre[] }
  );

  readonly cierresVisibles = computed(() => {
    const todos = this.cierres();
    if (this.isSuperAdmin()) return todos;
    return todos.filter(c => !c.sucursalId || c.sucursalId === this.sucursalId);
  });

  readonly mostrarFormCierre = signal(false);

  formCierre = this.fb.group({
    motivo:      ['', [Validators.required, Validators.minLength(3)]],
    fechaInicio: [null as Date | null, Validators.required],
    fechaFin:    [null as Date | null, Validators.required],
    esGlobal:    [false],
  });

  async guardarCierre(): Promise<void> {
    if (this.formCierre.invalid) return;
    const v = this.formCierre.value;
    const inicio = dateToStr(v.fechaInicio!);
    const fin    = dateToStr(v.fechaFin!);
    if (fin < inicio) {
      Swal.fire({ icon: 'error', title: 'Fechas inválidas', text: 'La fecha de fin debe ser igual o posterior al inicio.' });
      return;
    }
    const esGlobal   = this.isSuperAdmin() && !!v.esGlobal;
    const sucursalId = esGlobal ? undefined : this.sucursalId;
    this.guardando.set(true);
    try {
      await this.cierreService.crear({ motivo: v.motivo!, fechaInicio: inicio, fechaFin: fin, sucursalId, activo: true });
      this.formCierre.reset({ esGlobal: false });
      this.mostrarFormCierre.set(false);
      const fechas = TurnoService.expandirRango(inicio, fin);
      await this.ofrecerCancelarTurnos(fechas, `Cierre: ${v.motivo}`, sucursalId);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally { this.guardando.set(false); }
  }

  async eliminarCierre(c: Cierre): Promise<void> {
    const conf = await Swal.fire({
      icon: 'warning', title: '¿Eliminar cierre?',
      text: `${c.motivo} (${c.fechaInicio} → ${c.fechaFin})`,
      showCancelButton: true, confirmButtonText: 'Eliminar', confirmButtonColor: '#c62828',
    });
    if (conf.isConfirmed) await this.cierreService.eliminar(c.id!);
  }

  async toggleActivoCierre(c: Cierre): Promise<void> {
    await this.cierreService.toggleActivo(c.id!, !c.activo);
  }

  esCierreGlobal(c: Cierre): boolean {
    return !c.sucursalId;
  }

  private async ofrecerCancelarTurnos(fechas: string[], motivo: string, sucursalId: string | undefined): Promise<void> {
    const conteo = await this.contarTurnosAfectados(fechas, sucursalId);
    if (conteo === 0) {
      Swal.fire({ icon: 'success', title: 'Registrado', text: 'No había clases activas en esas fechas.', timer: 2000, showConfirmButton: false });
      return;
    }
    const conf = await Swal.fire({
      icon: 'warning',
      title: `${conteo} clase${conteo !== 1 ? 's' : ''} activa${conteo !== 1 ? 's' : ''} afectada${conteo !== 1 ? 's' : ''}`,
      html: `¿Cancelar estas clases y devolver el crédito a los alumnos?<br><small style="color:#888">Motivo que verán los alumnos: <em>${motivo}</em></small>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar y notificar',
      cancelButtonText: 'No cancelar',
      confirmButtonColor: '#c62828',
    });
    if (!conf.isConfirmed) {
      Swal.fire({ icon: 'success', title: 'Registrado', text: 'Las clases existentes no fueron modificadas.', timer: 2000, showConfirmButton: false });
      return;
    }
    const cancelados = await this.turnoService.cancelarTurnosPorEvento({ fechas, sucursalId, motivo });
    Swal.fire({ icon: 'success', title: 'Listo', text: `${cancelados} clase${cancelados !== 1 ? 's' : ''} cancelada${cancelados !== 1 ? 's' : ''} y crédito devuelto a los alumnos.`, timer: 2500, showConfirmButton: false });
  }

  private async contarTurnosAfectados(fechas: string[], sucursalId: string | undefined): Promise<number> {
    let count = 0;
    for (let i = 0; i < fechas.length; i += 10) {
      const lote = fechas.slice(i, i + 10);
      const snap = await getDocs(query(collection(this.firestore, 'turnos'), where('fechaStr', 'in', lote)));
      for (const d of snap.docs) {
        const t = d.data() as any;
        if (!['PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(t.estado)) continue;
        if (sucursalId && t.sucursalId !== sucursalId) continue;
        count++;
      }
    }
    return count;
  }
}

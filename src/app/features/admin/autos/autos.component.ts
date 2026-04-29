import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { Timestamp } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { AutoService } from '../../../core/services/auto.service';
import { Auto, RegistroMantenimiento, Transmision, TipoCombustible, TipoMotor } from '../../../shared/models';

@Component({
  selector: 'app-autos',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTooltipModule, MatProgressSpinnerModule,
    MatDividerModule, MatSlideToggleModule, MatChipsModule, MatCheckboxModule,
    MatDatepickerModule, MatNativeDateModule,
  ],
  templateUrl: './autos.component.html',
  styleUrl: './autos.component.scss',
})
export class AutosComponent {
  private authService = inject(AuthService);
  private autoService = inject(AutoService);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly loading = signal(true);
  readonly guardando = signal(false);
  readonly mostrarFormulario = signal(false);
  readonly modoEdicion = signal(false);
  readonly autoEditando = signal<Auto | null>(null);
  readonly filtro = signal('');
  readonly mostrarInactivos = signal(false);

  readonly autos = toSignal(
    this.autoService.getAutos$(this.sucursalId).pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as Auto[] },
  );

  readonly mantenimientosTodos = toSignal(
    this.autoService.getMantenimientosPorSucursal$(this.sucursalId),
    { initialValue: [] as RegistroMantenimiento[] },
  );

  readonly autosFiltrados = computed(() => {
    const f = this.filtro().toLowerCase();
    const todos = this.mantenimientosTodos();
    return this.autos()
      .filter(a => (this.mostrarInactivos() || a.activo) && (
        !f || a.patente.toLowerCase().includes(f) ||
        a.marca.toLowerCase().includes(f) || a.modelo.toLowerCase().includes(f)
      ))
      .map(a => {
        const alertas = this.autoService.calcularAlertas(a, todos.filter(m => m.autoId === a.id));
        return { ...a, ...this.autoService.contarAlertas(alertas) };
      });
  });

  form = this.fb.group({
    patente:              ['', Validators.required],
    marca:                ['', Validators.required],
    modelo:               ['', Validators.required],
    anio:                 [new Date().getFullYear(), [Validators.required, Validators.min(1990)]],
    color:                [''],
    transmision:          ['manual' as Transmision, Validators.required],
    combustible:          ['nafta' as TipoCombustible, Validators.required],
    tipoMotor:            ['cadena' as TipoMotor, Validators.required],
    kmActuales:           [0, [Validators.required, Validators.min(0)]],
    vtvFecha:             [null as Date | null],
    seguroFecha:          [null as Date | null],
    seguroPoliza:         [''],
    seguroAseguradora:    [''],
  });

  abrirNuevo(): void {
    this.modoEdicion.set(false);
    this.autoEditando.set(null);
    this.form.reset({ anio: new Date().getFullYear(), transmision: 'manual', combustible: 'nafta', tipoMotor: 'cadena', kmActuales: 0 });
    this.mostrarFormulario.set(true);
    setTimeout(() => document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  abrirEdicion(auto: Auto, event: Event): void {
    event.stopPropagation();
    this.modoEdicion.set(true);
    this.autoEditando.set(auto);
    this.form.patchValue({
      patente: auto.patente, marca: auto.marca, modelo: auto.modelo,
      anio: auto.anio, color: auto.color ?? '',
      transmision: auto.transmision, combustible: auto.combustible, tipoMotor: auto.tipoMotor,
      kmActuales: auto.kmActuales,
      seguroPoliza: auto.seguroPoliza ?? '', seguroAseguradora: auto.seguroAseguradora ?? '',
      vtvFecha:    auto.vtvVencimiento    ? auto.vtvVencimiento.toDate()    : null,
      seguroFecha: auto.seguroVencimiento ? auto.seguroVencimiento.toDate() : null,
    });
    this.mostrarFormulario.set(true);
    setTimeout(() => document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  cancelar(): void { this.mostrarFormulario.set(false); this.autoEditando.set(null); }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);
    try {
      const datos: Omit<Auto, 'id' | 'creadoEn'> = {
        sucursalId:        this.sucursalId,
        patente:           v.patente!.toUpperCase().trim(),
        marca:             v.marca!,
        modelo:            v.modelo!,
        anio:              v.anio!,
        color:             v.color || undefined,
        transmision:       v.transmision as Transmision,
        combustible:       v.combustible as TipoCombustible,
        tipoMotor:         v.tipoMotor as TipoMotor,
        kmActuales:        v.kmActuales!,
        seguroPoliza:      v.seguroPoliza || undefined,
        seguroAseguradora: v.seguroAseguradora || undefined,
        vtvVencimiento:    v.vtvFecha    ? Timestamp.fromDate(v.vtvFecha)    : null,
        seguroVencimiento: v.seguroFecha ? Timestamp.fromDate(v.seguroFecha) : null,
        activo: this.modoEdicion() ? (this.autoEditando()?.activo ?? true) : true,
      };
      if (this.modoEdicion()) {
        await this.autoService.actualizar(this.autoEditando()!.id!, datos);
        Swal.fire({ icon: 'success', title: 'Auto actualizado', timer: 1500, showConfirmButton: false });
      } else {
        await this.autoService.crear(datos);
        Swal.fire({ icon: 'success', title: 'Auto agregado', timer: 1500, showConfirmButton: false });
      }
      this.cancelar();
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(auto: Auto, event: Event): Promise<void> {
    event.stopPropagation();
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar auto?',
      html: `<strong>${auto.patente}</strong> — ${auto.marca} ${auto.modelo}<br>Se eliminarán también todos sus registros de mantenimiento.`,
      showCancelButton: true,
      confirmButtonText: 'Eliminar', confirmButtonColor: '#c62828', cancelButtonText: 'Cancelar',
    });
    if (!conf.isConfirmed) return;
    try {
      await this.autoService.eliminar(auto.id!);
      Swal.fire({ icon: 'success', title: 'Auto eliminado', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    }
  }

  async toggleActivo(auto: Auto, event: Event): Promise<void> {
    event.stopPropagation();
    const nuevoEstado = !auto.activo;
    const conf = await Swal.fire({
      icon: 'question',
      title: nuevoEstado ? '¿Activar auto?' : '¿Dar de baja auto?',
      text: `${auto.patente} — ${auto.marca} ${auto.modelo}`,
      showCancelButton: true,
      confirmButtonText: nuevoEstado ? 'Activar' : 'Dar de baja',
      confirmButtonColor: nuevoEstado ? '#2e7d32' : '#e65100',
    });
    if (conf.isConfirmed) await this.autoService.actualizar(auto.id!, { activo: nuevoEstado });
  }

  formatKm(km: number): string { return km.toLocaleString('es-AR') + ' km'; }
}

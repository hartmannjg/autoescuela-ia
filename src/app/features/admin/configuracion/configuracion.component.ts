import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { ConfiguracionGlobal, ConfiguracionSucursal, PreciosPlan } from '../../../shared/models';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { MonedaInputDirective } from '../../../shared/directives/moneda-input.directive';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSlideToggleModule, MatDividerModule, MatProgressSpinnerModule,
    MatSelectModule, MatTooltipModule, MonedaPipe, MonedaInputDirective,
  ],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.scss',
})
export class ConfiguracionComponent implements OnInit {
  private authService  = inject(AuthService);
  private configService = inject(ConfiguracionService);
  private fb = inject(FormBuilder);

  readonly cargando  = signal(true);
  readonly guardando = signal(false);

  readonly user         = this.authService.currentUser;
  readonly esSuperAdmin = computed(() => this.user()?.rol === 'super-admin');
  readonly sucursalId   = computed(() => this.user()?.sucursalId ?? '');

  // Estado cargado
  configGlobal   = signal<ConfiguracionGlobal | null>(null);
  configSucursal = signal<ConfiguracionSucursal | null>(null);

  // ── Formulario global (super-admin) ─────────────────────────
  formGlobal = this.fb.group({
    limites: this.fb.group({
      semanasSinClaseParaBloqueo: [4,  [Validators.required, Validators.min(1)]],
      horasAntesParaCancelar:     [24, [Validators.required, Validators.min(1)]],
      minutosQrValidez:           [30, [Validators.required, Validators.min(5)]],
    }),
    precios: this.fb.group({
      precioClase40min: [0, [Validators.required, Validators.min(0)]],
    }),
    notificaciones: this.fb.group({
      recordatorio24hs:      [true],
      recordatorio2hs:       [true],
      confirmacionTurno:     [true],
      alertaSaldoBajo:       [true],
      alertaVencimientoPlan: [true],
    }),
    planes: this.fb.array([]),
  });

  // ── Formulario override de sucursal (admin) ─────────────────
  formSucursal = this.fb.group({
    precioClase40min: [null as number | null],
    usarPlanesPersonalizados: [false],
    planes: this.fb.array([]),
  });

  get planesGlobalArray(): FormArray  { return this.formGlobal.get('planes') as FormArray; }
  get planesSucursalArray(): FormArray { return this.formSucursal.get('planes') as FormArray; }

  async ngOnInit(): Promise<void> {
    const global = await this.configService.getOnce();
    this.configGlobal.set(global);

    if (this.esSuperAdmin()) {
      this.cargarFormGlobal(global);
    } else {
      const override = await this.configService.getSucursalOnce(this.sucursalId());
      this.configSucursal.set(override);
      this.cargarFormSucursal(override);
    }
    this.cargando.set(false);
  }

  private cargarFormGlobal(config: ConfiguracionGlobal): void {
    this.formGlobal.patchValue({
      limites: config.limites,
      precios: {
        precioClase40min: config.precios.precioClase40min ?? 0,
      },
      notificaciones: config.notificaciones,
    });
    this.planesGlobalArray.clear();
    config.precios.planes.forEach(p => this.planesGlobalArray.push(this.crearPlanGroup(p)));
  }

  private cargarFormSucursal(override: ConfiguracionSucursal | null): void {
    const tieneOverride = override !== null;
    const tieneePlanes  = tieneOverride && override!.precios.planes !== null;
    this.formSucursal.patchValue({
      precioClase40min: override?.precios.precioClase40min ?? null,
      usarPlanesPersonalizados: tieneePlanes,
    });
    this.planesSucursalArray.clear();
    if (tieneePlanes) {
      override!.precios.planes!.forEach(p => this.planesSucursalArray.push(this.crearPlanGroup(p)));
    }
  }

  private crearPlanGroup(p?: Partial<PreciosPlan>) {
    return this.fb.group({
      id:                 [p?.id ?? this.generateId()],
      nombre:             [p?.nombre ?? '',  Validators.required],
      duracionClase:      [p?.duracionClase ?? 80, Validators.required],
      cantidadClases:     [p?.cantidadClases ?? 10, [Validators.required, Validators.min(1)]],
      precio:             [p?.precio ?? 0,   [Validators.required, Validators.min(0)]],
      maxClasesPorDia:    [p?.maxClasesPorDia ?? null], // null = sin límite
      maxClasesPorSemana: [p?.maxClasesPorSemana ?? 3, [Validators.required, Validators.min(1)]],
      activo:             [p?.activo ?? true],
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  agregarPlanGlobal():   void { this.planesGlobalArray.push(this.crearPlanGroup()); }
  quitarPlanGlobal(i: number): void { this.planesGlobalArray.removeAt(i); }

  agregarPlanSucursal():   void { this.planesSucursalArray.push(this.crearPlanGroup()); }
  quitarPlanSucursal(i: number): void { this.planesSucursalArray.removeAt(i); }

  // ── Guardar global (super-admin) ─────────────────────────────
  async guardarGlobal(): Promise<void> {
    if (this.formGlobal.invalid) { this.formGlobal.markAllAsTouched(); return; }
    const v = this.formGlobal.getRawValue();
    this.guardando.set(true);
    try {
      const config: Omit<ConfiguracionGlobal, 'id'> = {
        limites: v.limites as any,
        precios: {
          planes: v.planes as any,
          precioClase40min: v.precios.precioClase40min ?? 0,
        },
        notificaciones: v.notificaciones as any,
      };
      await this.configService.guardar(config);
      this.configGlobal.set({ ...config, id: 'global' });
      Swal.fire({ icon: 'success', title: 'Configuración global guardada', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  // ── Guardar override de sucursal (admin) ─────────────────────
  async guardarSucursal(): Promise<void> {
    if (this.formSucursal.invalid) { this.formSucursal.markAllAsTouched(); return; }
    const v = this.formSucursal.getRawValue();
    const usaPlanes = v.usarPlanesPersonalizados;
    this.guardando.set(true);
    try {
      const precios = {
        precioClase40min: v.precioClase40min,
        planes: usaPlanes ? (v.planes as any) : null,
      };
      await this.configService.guardarSucursal(this.sucursalId(), precios);
      Swal.fire({ icon: 'success', title: 'Precios de la sucursal guardados', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async restablecerGlobal(): Promise<void> {
    const r = await Swal.fire({
      icon: 'question',
      title: '¿Restablecer al precio global?',
      text: 'Se eliminarán todos los precios personalizados de esta sucursal.',
      showCancelButton: true,
      confirmButtonText: 'Restablecer',
      confirmButtonColor: '#c62828',
    });
    if (!r.isConfirmed) return;
    await this.configService.eliminarOverrideSucursal(this.sucursalId());
    this.configSucursal.set(null);
    this.cargarFormSucursal(null);
    Swal.fire({ icon: 'success', title: 'Restablecido al global', timer: 1500, showConfirmButton: false });
  }

  precioGlobal(campo: 'precioClase40min'): number {
    return this.configGlobal()?.precios[campo] ?? 0;
  }
}

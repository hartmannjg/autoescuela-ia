import { Component, inject, signal, OnInit } from '@angular/core';
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
import Swal from 'sweetalert2';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { ConfiguracionGlobal, PreciosPlan, PreciosPaquete } from '../../../shared/models';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSlideToggleModule, MatDividerModule, MatProgressSpinnerModule, MatSelectModule,
  ],
  templateUrl: './configuracion.component.html',
  styleUrl: './configuracion.component.scss',
})
export class ConfiguracionComponent implements OnInit {
  private configService = inject(ConfiguracionService);
  private fb = inject(FormBuilder);

  readonly cargando = signal(true);
  readonly guardando = signal(false);

  form = this.fb.group({
    limites: this.fb.group({
      maxClasesPorSemana: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
      minClasesPorSemana: [0, [Validators.required, Validators.min(0)]],
      semanasSinClaseParaBloqueo: [4, [Validators.required, Validators.min(1)]],
      horasAntesParaCancelar: [24, [Validators.required, Validators.min(1)]],
      minutosQrValidez: [30, [Validators.required, Validators.min(5)]],
    }),
    notificaciones: this.fb.group({
      recordatorio24hs: [true],
      recordatorio2hs: [true],
      confirmacionTurno: [true],
      alertaSaldoBajo: [true],
      alertaVencimientoPlan: [true],
    }),
    planes: this.fb.array([]),
    paquetes: this.fb.array([]),
  });

  get planesArray(): FormArray { return this.form.get('planes') as FormArray; }
  get paquetesArray(): FormArray { return this.form.get('paquetes') as FormArray; }

  async ngOnInit(): Promise<void> {
    const config = await this.configService.getOnce();
    this.form.patchValue({
      limites: config.limites,
      notificaciones: config.notificaciones,
    });
    this.planesArray.clear();
    config.precios.planes.forEach(p => this.planesArray.push(this.crearPlanGroup(p)));
    this.paquetesArray.clear();
    config.precios.paquetes.forEach(p => this.paquetesArray.push(this.crearPaqueteGroup(p)));
    this.cargando.set(false);
  }

  private crearPlanGroup(p?: Partial<PreciosPlan>) {
    return this.fb.group({
      id: [p?.id ?? this.generateId()],
      nombre: [p?.nombre ?? '', Validators.required],
      duracionMinutos: [p?.duracionMinutos ?? 60, Validators.required],
      cantidadClases: [p?.cantidadClases ?? 10, [Validators.required, Validators.min(1)]],
      precio: [p?.precio ?? 0, [Validators.required, Validators.min(0)]],
      activo: [p?.activo ?? true],
    });
  }

  private crearPaqueteGroup(p?: Partial<PreciosPaquete>) {
    return this.fb.group({
      id: [p?.id ?? this.generateId()],
      cantidadClases: [p?.cantidadClases ?? 5, [Validators.required, Validators.min(1)]],
      precio: [p?.precio ?? 0, [Validators.required, Validators.min(0)]],
      activo: [p?.activo ?? true],
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  agregarPlan(): void { this.planesArray.push(this.crearPlanGroup()); }
  quitarPlan(i: number): void { this.planesArray.removeAt(i); }
  agregarPaquete(): void { this.paquetesArray.push(this.crearPaqueteGroup()); }
  quitarPaquete(i: number): void { this.paquetesArray.removeAt(i); }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);
    try {
      const config: Omit<ConfiguracionGlobal, 'id'> = {
        limites: v.limites as any,
        notificaciones: v.notificaciones as any,
        precios: {
          planes: v.planes as any,
          paquetes: v.paquetes as any,
        },
      };
      await this.configService.guardar(config);
      Swal.fire({ icon: 'success', title: 'Configuración guardada', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }
}

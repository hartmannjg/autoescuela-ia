import { Component, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { SucursalService } from '../../../core/services/sucursal.service';
import { Sucursal } from '../../../shared/models';

@Component({
  selector: 'app-sucursales',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatDividerModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './sucursales.component.html',
  styleUrl: './sucursales.component.scss',
})
export class SucursalesComponent {
  private sucursalService = inject(SucursalService);
  private fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly sucursales = toSignal(
    this.sucursalService.todasLasSucursales$().pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as Sucursal[] }
  );
  readonly mostrarFormulario = signal(false);
  readonly editandoId = signal<string | null>(null);
  readonly guardando = signal(false);

  form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    direccion: ['', Validators.required],
    telefono: ['', Validators.required],
    lat: [0, [Validators.required, Validators.min(-90), Validators.max(90)]],
    lng: [0, [Validators.required, Validators.min(-180), Validators.max(180)]],
    radioPermitido: [200, [Validators.required, Validators.min(50), Validators.max(2000)]],
    horarioApertura: ['08:00', Validators.required],
    horarioCierre: ['20:00', Validators.required],
  });

  abrirFormulario(s?: Sucursal): void {
    this.editandoId.set(s?.id ?? null);
    if (s) {
      this.form.patchValue({
        nombre: s.nombre,
        direccion: s.direccion,
        telefono: s.telefono,
        lat: s.ubicacion.lat,
        lng: s.ubicacion.lng,
        radioPermitido: s.ubicacion.radioPermitido,
        horarioApertura: s.configuracionHorarios.horarioApertura,
        horarioCierre: s.configuracionHorarios.horarioCierre,
      });
    } else {
      this.form.reset({ lat: 0, lng: 0, radioPermitido: 200, horarioApertura: '08:00', horarioCierre: '20:00' });
    }
    this.mostrarFormulario.set(true);
  }

  cancelar(): void {
    this.mostrarFormulario.set(false);
    this.editandoId.set(null);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.guardando.set(true);
    try {
      const datos: Omit<Sucursal, 'id'> = {
        nombre: v.nombre!,
        direccion: v.direccion!,
        telefono: v.telefono!,
        activo: true,
        ubicacion: { lat: v.lat!, lng: v.lng!, radioPermitido: v.radioPermitido! },
        configuracionHorarios: {
          slotBaseMinutos: 20,
          duracionesPermitidas: [20, 40, 60],
          horarioApertura: v.horarioApertura!,
          horarioCierre: v.horarioCierre!,
          diasLaborales: [1, 2, 3, 4, 5, 6],
        },
      };
      const id = this.editandoId();
      if (id) {
        await this.sucursalService.actualizar(id, datos);
      } else {
        await this.sucursalService.crear(datos);
      }
      Swal.fire({ icon: 'success', title: id ? 'Sucursal actualizada' : 'Sucursal creada', timer: 1500, showConfirmButton: false });
      this.cancelar();
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async toggleActivo(s: Sucursal): Promise<void> {
    const conf = await Swal.fire({
      icon: 'question',
      title: s.activo ? '¿Desactivar sucursal?' : '¿Activar sucursal?',
      text: s.nombre,
      showCancelButton: true,
      confirmButtonText: s.activo ? 'Desactivar' : 'Activar',
      confirmButtonColor: s.activo ? '#c62828' : '#2e7d32',
    });
    if (conf.isConfirmed) {
      await this.sucursalService.toggleActivo(s.id!, !s.activo);
    }
  }
}

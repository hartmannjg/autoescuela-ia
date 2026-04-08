import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { FeriadoService } from '../../../core/services/feriado.service';
import { Feriado, TipoFeriado } from '../../../shared/models';

@Component({
  selector: 'app-feriados',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTableModule, MatTooltipModule, MatProgressSpinnerModule,
  ],
  templateUrl: './feriados.component.html',
  styleUrl: './feriados.component.scss',
})
export class FeriadosComponent {
  private authService = inject(AuthService);
  private feriadoService = inject(FeriadoService);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly isSuperAdmin = this.authService.isSuperAdmin;
  readonly feriados = toSignal(this.feriadoService.todos$(), { initialValue: [] as Feriado[] });
  readonly mostrarFormulario = signal(false);
  readonly guardando = signal(false);

  readonly tiposOptions: { value: TipoFeriado; label: string }[] = [
    { value: 'nacional', label: 'Nacional' },
    { value: 'provincial', label: 'Provincial' },
    { value: 'sucursal', label: 'Solo esta sucursal' },
  ];

  readonly columnas = ['fecha', 'nombre', 'tipo', 'estado', 'acciones'];

  form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    fecha: ['', Validators.required],
    tipo: ['nacional' as TipoFeriado, Validators.required],
  });

  abrirFormulario(): void {
    this.form.reset({ tipo: 'nacional' });
    this.mostrarFormulario.set(true);
  }

  cancelar(): void {
    this.mostrarFormulario.set(false);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.guardando.set(true);
    try {
      await this.feriadoService.crear({
        nombre: v.nombre!,
        fecha: v.fecha!,
        tipo: v.tipo!,
        sucursalId: v.tipo === 'sucursal' ? this.sucursalId : undefined,
        activo: true,
      });
      Swal.fire({ icon: 'success', title: 'Feriado registrado', timer: 1500, showConfirmButton: false });
      this.cancelar();
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(f: Feriado): Promise<void> {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar feriado?',
      text: `${f.nombre} — ${f.fecha}`,
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      confirmButtonColor: '#c62828',
    });
    if (conf.isConfirmed) {
      await this.feriadoService.eliminar(f.id!);
    }
  }

  async toggleActivo(f: Feriado): Promise<void> {
    await this.feriadoService.toggleActivo(f.id!, !f.activo);
  }

  getTipoLabel(tipo: TipoFeriado): string {
    return this.tiposOptions.find(t => t.value === tipo)?.label ?? tipo;
  }
}

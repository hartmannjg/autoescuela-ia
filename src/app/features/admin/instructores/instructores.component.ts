import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { User } from '../../../shared/models';

@Component({
  selector: 'app-instructores',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDialogModule,
    MatTooltipModule, MatSlideToggleModule, MatProgressSpinnerModule,
  ],
  templateUrl: './instructores.component.html',
  styleUrl: './instructores.component.scss',
})
export class InstructoresComponent {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtro = signal('');
  readonly guardando = signal(false);
  readonly mostrarFormulario = signal(false);
  readonly instructorEditando = signal<User | null>(null);

  readonly instructores = toSignal(
    this.usuarioService.instructoresPorSucursal$(this.sucursalId),
    { initialValue: [] as User[] }
  );

  readonly instructoresFiltrados = computed(() => {
    const f = this.filtro().toLowerCase();
    return this.instructores().filter(i =>
      i.nombre.toLowerCase().includes(f) || i.email.toLowerCase().includes(f)
    );
  });

  readonly columnas = ['nombre', 'email', 'especialidad', 'clases', 'valoracion', 'estado', 'acciones'];

  form = this.fb.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    telefono: [''],
    especialidad: [''],
    limiteDiario: [6, [Validators.required, Validators.min(1), Validators.max(20)]],
  });

  abrirFormulario(instructor?: User): void {
    this.instructorEditando.set(instructor ?? null);
    if (instructor) {
      this.form.patchValue({
        nombre: instructor.nombre,
        email: instructor.email,
        telefono: instructor.telefono ?? '',
        especialidad: instructor.instructorData?.especialidad ?? '',
        limiteDiario: instructor.instructorData?.limiteDiario ?? 6,
      });
      this.form.get('email')?.disable();
    } else {
      this.form.reset({ limiteDiario: 6 });
      this.form.get('email')?.enable();
    }
    this.mostrarFormulario.set(true);
  }

  cancelar(): void {
    this.mostrarFormulario.set(false);
    this.instructorEditando.set(null);
    this.form.reset({ limiteDiario: 6 });
    this.form.get('email')?.enable();
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);
    try {
      const editando = this.instructorEditando();
      if (editando) {
        await this.usuarioService.actualizar(editando.uid, {
          nombre: v.nombre!,
          telefono: v.telefono ?? undefined,
          instructorData: {
            ...editando.instructorData!,
            especialidad: v.especialidad ?? undefined,
            limiteDiario: v.limiteDiario ?? 6,
          },
        });
        Swal.fire({ icon: 'success', title: 'Instructor actualizado', timer: 1500, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'info', title: 'Para crear instructores', text: 'Creá el usuario desde Firebase Console y luego asigná el rol "instructor" en Firestore.', confirmButtonColor: '#37474f' });
      }
      this.cancelar();
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async toggleActivo(instructor: User): Promise<void> {
    const nuevoEstado = !instructor.activo;
    const confirmacion = await Swal.fire({
      icon: 'question',
      title: nuevoEstado ? '¿Activar instructor?' : '¿Desactivar instructor?',
      text: instructor.nombre,
      showCancelButton: true,
      confirmButtonText: nuevoEstado ? 'Activar' : 'Desactivar',
      confirmButtonColor: nuevoEstado ? '#2e7d32' : '#c62828',
    });
    if (confirmacion.isConfirmed) {
      await this.usuarioService.activarDesactivar(instructor.uid, nuevoEstado);
      if (!nuevoEstado) {
        await this.usuarioService.actualizar(instructor.uid, {
          instructorData: { ...instructor.instructorData!, activo: false },
        });
      }
    }
  }

  getEstrellas(val: number): string {
    return '★'.repeat(Math.round(val)) + '☆'.repeat(5 - Math.round(val));
  }
}

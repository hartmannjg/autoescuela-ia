import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { tap } from 'rxjs';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { toSignal } from '@angular/core/rxjs-interop';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, Firestore } from '@angular/fire/firestore';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { User } from '../../../shared/models';
import { environment } from '../../../../environments/environment';
import { WhatsappPipe } from '../../../shared/pipes/whatsapp.pipe';

@Component({
  selector: 'app-instructores',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    MatSlideToggleModule, MatProgressSpinnerModule, MatDividerModule, WhatsappPipe,
  ],
  templateUrl: './instructores.component.html',
  styleUrl: './instructores.component.scss',
})
export class InstructoresComponent {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtro = signal('');
  readonly guardando = signal(false);
  readonly mostrarFormulario = signal(false);
  readonly modoEdicion = signal(false);
  readonly instructorEditando = signal<User | null>(null);
  readonly showPassword = signal(false);
  readonly loading = signal(true);

  readonly instructores = toSignal(
    this.usuarioService.instructoresPorSucursal$(this.sucursalId).pipe(tap(() => this.loading.set(false))),
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
    nombre:       ['', [Validators.required, Validators.minLength(3)]],
    email:        ['', [Validators.required, Validators.email]],
    password:     ['', [Validators.required, Validators.minLength(6)]],
    telefono:     [''],
    especialidad: [''],
  });

  abrirNuevo(): void {
    this.modoEdicion.set(false);
    this.instructorEditando.set(null);
    this.form.reset();
    this.form.get('email')?.enable();
    this.form.get('password')?.enable();
    this.form.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.form.get('password')?.updateValueAndValidity();
    this.mostrarFormulario.set(true);
  }

  abrirEdicion(instructor: User): void {
    this.modoEdicion.set(true);
    this.instructorEditando.set(instructor);
    this.form.patchValue({
      nombre:       instructor.nombre,
      email:        instructor.email,
      telefono:     instructor.telefono ?? '',
      especialidad: instructor.instructorData?.especialidad ?? '',
    });
    this.form.get('email')?.disable();
    this.form.get('password')?.disable();
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.mostrarFormulario.set(true);
  }

  cancelar(): void {
    this.mostrarFormulario.set(false);
    this.instructorEditando.set(null);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);

    try {
      if (this.modoEdicion()) {
        const inst = this.instructorEditando()!;
        await this.usuarioService.actualizar(inst.uid, {
          nombre:   v.nombre!,
          telefono: v.telefono || undefined,
          instructorData: {
            ...inst.instructorData!,
            especialidad: v.especialidad || undefined,
          },
        });
        Swal.fire({ icon: 'success', title: 'Instructor actualizado', timer: 1500, showConfirmButton: false });
      } else {
        // Crear con app secundaria para no cerrar sesión del admin
        const secondaryApp = initializeApp(environment.firebase, `create-inst-${Date.now()}`);
        try {
          const secondaryAuth = getAuth(secondaryApp);
          await setPersistence(secondaryAuth, inMemoryPersistence);
          const cred = await createUserWithEmailAndPassword(secondaryAuth, v.email!, v.password!);
          const uid = cred.user.uid;

          const nuevoInstructor: User = {
            uid,
            email:      v.email!,
            nombre:     v.nombre!,
            telefono:   v.telefono || undefined,
            sucursalId: this.sucursalId,
            rol:        'instructor',
            activo:     true,
            fechaAlta:  serverTimestamp() as any,
            instructorData: {
              especialidad:        v.especialidad || undefined,
              horariosDisponibles: [],
              clasesDictadas:      0,
              valoracionPromedio:  0,
              activo:              true,
            },
          };

          await setDoc(doc(this.firestore, 'users', uid), nuevoInstructor);
          Swal.fire({ icon: 'success', title: 'Instructor creado', text: `${v.nombre} fue dado de alta correctamente.`, timer: 2000, showConfirmButton: false });
        } finally {
          await deleteApp(secondaryApp);
        }
      }
      this.cancelar();
    } catch (e: any) {
      const msg = e.code === 'auth/email-already-in-use'
        ? 'Ya existe un usuario con ese email.'
        : e.message;
      Swal.fire({ icon: 'error', title: 'Error', text: msg });
    } finally {
      this.guardando.set(false);
    }
  }

  async eliminar(instructor: User): Promise<void> {
    const confirm1 = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar instructor?',
      html: `<p>Esta acción borrará permanentemente a <strong>${instructor.nombre}</strong> del sistema.</p><p>Sus turnos quedarán como historial.</p>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      confirmButtonColor: '#c62828',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm1.isConfirmed) return;

    const { value: confirmTexto } = await Swal.fire({
      title: 'Confirmación final',
      html: `Escribí <strong>ELIMINAR</strong> para confirmar`,
      input: 'text',
      inputPlaceholder: 'ELIMINAR',
      showCancelButton: true,
      confirmButtonText: 'Eliminar definitivamente',
      confirmButtonColor: '#c62828',
      inputValidator: v => v !== 'ELIMINAR' ? 'Escribí ELIMINAR para confirmar' : undefined,
    });
    if (!confirmTexto) return;

    try {
      await this.usuarioService.eliminar(instructor.uid);
      Swal.fire({ icon: 'success', title: 'Instructor eliminado', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    }
  }

  async toggleActivo(instructor: User): Promise<void> {
    const nuevoEstado = !instructor.activo;
    const conf = await Swal.fire({
      icon: 'question',
      title: nuevoEstado ? '¿Activar instructor?' : '¿Desactivar instructor?',
      text: instructor.nombre,
      showCancelButton: true,
      confirmButtonText: nuevoEstado ? 'Activar' : 'Desactivar',
      confirmButtonColor: nuevoEstado ? '#2e7d32' : '#c62828',
    });
    if (conf.isConfirmed) {
      await this.usuarioService.activarDesactivar(instructor.uid, nuevoEstado);
    }
  }

  getEstrellas(val: number): string {
    const r = Math.round(val);
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }
}

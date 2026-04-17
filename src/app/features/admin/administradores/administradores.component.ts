import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { tap } from 'rxjs';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
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

@Component({
  selector: 'app-administradores',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatProgressSpinnerModule, MatDividerModule,
  ],
  templateUrl: './administradores.component.html',
  styleUrl: './administradores.component.scss',
})
export class AdministradoresComponent {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtro = signal('');
  readonly guardando = signal(false);
  readonly mostrarFormulario = signal(false);
  readonly showPassword = signal(false);
  readonly loading = signal(true);

  readonly admins = toSignal(
    this.usuarioService.adminsPorSucursal$(this.sucursalId).pipe(tap(() => this.loading.set(false))),
    { initialValue: [] as User[] }
  );

  readonly adminsFiltrados = computed(() => {
    const f = this.filtro().toLowerCase();
    return this.admins().filter(a =>
      a.nombre.toLowerCase().includes(f) || a.email.toLowerCase().includes(f)
    );
  });

  readonly columnas = ['nombre', 'estado', 'acciones'];

  form = this.fb.group({
    nombre:   ['', [Validators.required, Validators.minLength(3)]],
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    telefono: [''],
  });

  abrirFormulario(): void {
    this.form.reset();
    this.mostrarFormulario.set(true);
  }

  cancelar(): void { this.mostrarFormulario.set(false); }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);

    const secondaryApp = initializeApp(environment.firebase, `create-admin-${Date.now()}`);
    try {
      const secondaryAuth = getAuth(secondaryApp);
      await setPersistence(secondaryAuth, inMemoryPersistence);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, v.email!, v.password!);
      const uid = cred.user.uid;

      const nuevoAdmin: User = {
        uid,
        email:      v.email!,
        nombre:     v.nombre!,
        telefono:   v.telefono || undefined,
        sucursalId: this.sucursalId,
        rol:        'admin',
        activo:     true,
        fechaAlta:  serverTimestamp() as any,
      };

      await setDoc(doc(this.firestore, 'users', uid), nuevoAdmin);
      Swal.fire({ icon: 'success', title: 'Administrador creado', text: `${v.nombre} fue dado de alta.`, timer: 2000, showConfirmButton: false });
      this.cancelar();
    } catch (e: any) {
      const msg = e.code === 'auth/email-already-in-use'
        ? 'Ya existe un usuario con ese email.'
        : e.message;
      Swal.fire({ icon: 'error', title: 'Error al crear administrador', text: msg });
    } finally {
      await deleteApp(secondaryApp);
      this.guardando.set(false);
    }
  }

  async toggleActivo(admin: User): Promise<void> {
    const nuevoEstado = !admin.activo;
    const conf = await Swal.fire({
      icon: 'question',
      title: nuevoEstado ? '¿Activar administrador?' : '¿Desactivar administrador?',
      text: admin.nombre,
      showCancelButton: true,
      confirmButtonText: nuevoEstado ? 'Activar' : 'Desactivar',
      confirmButtonColor: nuevoEstado ? '#2e7d32' : '#c62828',
    });
    if (conf.isConfirmed) await this.usuarioService.activarDesactivar(admin.uid, nuevoEstado);
  }
}

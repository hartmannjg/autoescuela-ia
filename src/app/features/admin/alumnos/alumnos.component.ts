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
import { MatChipsModule } from '@angular/material/chips';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, Firestore } from '@angular/fire/firestore';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { User } from '../../../shared/models';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-alumnos',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatChipsModule, MatTableModule,
    MatSortModule, MatTooltipModule, MatProgressSpinnerModule,
  ],
  templateUrl: './alumnos.component.html',
  styleUrl: './alumnos.component.scss',
})
export class AlumnosComponent {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtro = signal('');
  readonly filtroBloqueado = signal<boolean | null>(null);
  readonly mostrarFormulario = signal(false);
  readonly guardando = signal(false);
  readonly showPassword = signal(false);

  readonly alumnos = toSignal(
    this.usuarioService.alumnosPorSucursal$(this.sucursalId),
    { initialValue: [] as User[] }
  );

  readonly alumnosFiltrados = computed(() => {
    const f = this.filtro().toLowerCase();
    return this.alumnos().filter(a => {
      const matchNombre = a.nombre.toLowerCase().includes(f) || a.email.toLowerCase().includes(f);
      const matchBloqueado = this.filtroBloqueado() === null || a.alumnoData?.bloqueado === this.filtroBloqueado();
      return matchNombre && matchBloqueado;
    });
  });

  readonly columnas = ['nombre', 'email', 'plan', 'saldo', 'estado', 'acciones'];

  form = this.fb.group({
    nombre:            ['', [Validators.required, Validators.minLength(3)]],
    email:             ['', [Validators.required, Validators.email]],
    password:          ['', [Validators.required, Validators.minLength(6)]],
    telefono:          [''],
    tipoAlumno:        ['individual', Validators.required],
    maxClasesPorSemana: [3, [Validators.required, Validators.min(1), Validators.max(10)]],
    semanasSinClaseMax: [4, [Validators.required, Validators.min(1), Validators.max(12)]],
  });

  abrirFormulario(): void {
    this.form.reset({ tipoAlumno: 'individual', maxClasesPorSemana: 3, semanasSinClaseMax: 4 });
    this.mostrarFormulario.set(true);
  }

  cancelar(): void {
    this.mostrarFormulario.set(false);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);

    // Usamos una app secundaria para crear el usuario Auth sin cerrar la sesión del admin
    const secondaryApp = initializeApp(environment.firebase, `create-user-${Date.now()}`);
    try {
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, v.email!, v.password!);
      const uid = cred.user.uid;

      const nuevoUsuario: User = {
        uid,
        email: v.email!,
        nombre: v.nombre!,
        telefono: v.telefono || undefined,
        sucursalId: this.sucursalId,
        rol: 'alumno',
        activo: true,
        fechaAlta: serverTimestamp() as any,
        alumnoData: {
          tipoAlumno: v.tipoAlumno as any,
          bloqueado: false,
          reglasAsignacion: {
            maxClasesPorSemana: v.maxClasesPorSemana!,
            requiereMinimoSemanal: false,
            semanasSinClaseMax: v.semanasSinClaseMax!,
            puedeAgendarSinLimite: false,
          },
          creditoIndividual: {
            clasesDisponibles: 0,
            clasesTomadas: 0,
            paquetesComprados: [],
          },
        },
      };

      await setDoc(doc(this.firestore, 'users', uid), nuevoUsuario);

      Swal.fire({ icon: 'success', title: 'Alumno creado', text: `${v.nombre} fue dado de alta correctamente.`, timer: 2000, showConfirmButton: false });
      this.cancelar();
    } catch (e: any) {
      const msg = e.code === 'auth/email-already-in-use'
        ? 'Ya existe un usuario con ese email.'
        : e.message;
      Swal.fire({ icon: 'error', title: 'Error al crear alumno', text: msg });
    } finally {
      await deleteApp(secondaryApp);
      this.guardando.set(false);
    }
  }

  getSaldoTotal(alumno: User): number {
    return (alumno.alumnoData?.planContratado?.clasesRestantes ?? 0)
         + (alumno.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0);
  }

  async toggleBloqueo(alumno: User): Promise<void> {
    if (alumno.alumnoData?.bloqueado) {
      const r = await Swal.fire({ title: '¿Desbloquear alumno?', text: alumno.nombre, icon: 'question', showCancelButton: true, confirmButtonText: 'Desbloquear', confirmButtonColor: '#2e7d32' });
      if (r.isConfirmed) await this.usuarioService.desbloquearAlumno(alumno.uid);
    } else {
      const { value: motivo } = await Swal.fire({ title: 'Bloquear alumno', input: 'textarea', inputLabel: 'Motivo del bloqueo', showCancelButton: true, confirmButtonText: 'Bloquear', confirmButtonColor: '#c62828', inputValidator: v => !v ? 'El motivo es requerido' : undefined });
      if (motivo) await this.usuarioService.bloquearAlumno(alumno.uid, motivo);
    }
  }

  async recargarCredito(alumno: User): Promise<void> {
    const { value: cant } = await Swal.fire({ title: 'Recargar crédito', input: 'number', inputLabel: 'Cantidad de clases a agregar', inputAttributes: { min: '1', max: '50' }, showCancelButton: true, confirmButtonText: 'Recargar', confirmButtonColor: '#1a237e' });
    if (cant) await this.usuarioService.recargarCredito(alumno.uid, Number(cant));
  }
}

import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { tap } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { toSignal } from '@angular/core/rxjs-interop';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, Timestamp, Firestore } from '@angular/fire/firestore';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { ConfiguracionService } from '../../../core/services/configuracion.service';
import { User, AlumnoData, PlanContratado, PreciosPlan } from '../../../shared/models';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { DuracionPipe } from '../../../shared/pipes/duracion.pipe';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-alumnos',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTableModule,
    MatTooltipModule, MatProgressSpinnerModule, MatDividerModule, MatSlideToggleModule, MonedaPipe, DuracionPipe,
  ],
  templateUrl: './alumnos.component.html',
  styleUrl: './alumnos.component.scss',
})
export class AlumnosComponent implements OnInit {
  private authService = inject(AuthService);
  private usuarioService = inject(UsuarioService);
  private configService = inject(ConfiguracionService);
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtro = signal('');
  readonly filtroBloqueado = signal<boolean | null>(null);
  readonly mostrarFormulario = signal(false);
  readonly guardando = signal(false);
  readonly showPassword = signal(false);
  readonly planesDisponibles = signal<PreciosPlan[]>([]);
  readonly loading = signal(true);

  readonly alumnos = toSignal(
    this.usuarioService.alumnosPorSucursal$(this.sucursalId).pipe(tap(() => this.loading.set(false))),
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

  readonly columnas = ['nombre', 'email', 'credito', 'estado', 'acciones'];

  form = this.fb.group({
    nombre:             ['', [Validators.required, Validators.minLength(3)]],
    email:              ['', [Validators.required, Validators.email]],
    password:           ['', [Validators.required, Validators.minLength(6)]],
    telefono:           [''],
    // Crédito individual
    asignarIndividual:  [false],
    clasesIndividuales: [0,  [Validators.min(0)]],
    // Plan
    asignarPlan:        [false],
    planId:             [''],
  });

  async ngOnInit(): Promise<void> {
    const config = await this.configService.getOnce();
    this.planesDisponibles.set(config.precios.planes.filter(p => p.activo));
  }

  get asignarIndividual() { return this.form.get('asignarIndividual')?.value; }
  get asignarPlan()       { return this.form.get('asignarPlan')?.value; }

  getPlanSeleccionado(): PreciosPlan | undefined {
    const id = this.form.get('planId')?.value;
    return this.planesDisponibles().find(p => p.id === id);
  }

  abrirFormulario(): void {
    this.form.reset({ clasesIndividuales: 0 });
    this.mostrarFormulario.set(true);
  }

  cancelar(): void {
    this.mostrarFormulario.set(false);
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.guardando.set(true);

    const secondaryApp = initializeApp(environment.firebase, `create-alumno-${Date.now()}`);
    try {
      const secondaryAuth = getAuth(secondaryApp);
      await setPersistence(secondaryAuth, inMemoryPersistence);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, v.email!, v.password!);
      const uid = cred.user.uid;

      // Determinar tipo de alumno
      const tienePlan = v.asignarPlan && v.planId;
      const tieneIndividual = v.asignarIndividual && (v.clasesIndividuales ?? 0) > 0;
      const tipoAlumno = tienePlan && tieneIndividual ? 'mixto'
                       : tienePlan ? 'plan' : 'individual';

      // Armar planContratado si corresponde
      let planContratado: PlanContratado | undefined;
      if (tienePlan) {
        const plan = this.getPlanSeleccionado()!;
        const hoy = new Date();
        const fin = new Date(hoy);
        fin.setMonth(fin.getMonth() + 3);
        planContratado = {
          id:               plan.id,
          nombre:           plan.nombre,
          duracionClase:    plan.duracionClase,
          clasesTotales:    plan.cantidadClases,
          clasesRestantes:  plan.cantidadClases,
          clasesTomadas:    0,
          fechaInicio:      Timestamp.fromDate(hoy),
          fechaFin:         Timestamp.fromDate(fin),
          valor:            plan.precio,
          maxClasesPorDia:  plan.maxClasesPorDia,
          maxClasesPorSemana: plan.maxClasesPorSemana,
        };
      }

      const alumnoData: AlumnoData = {
        tipoAlumno,
        bloqueado: false,
        ...(planContratado && { planContratado }),
        ...(tieneIndividual && {
          creditoIndividual: {
            clasesDisponibles: v.clasesIndividuales ?? 0,
            clasesTomadas:     0,
            ultimaAsignacion:  serverTimestamp() as any,
          },
        }),
      };

      const nuevoUsuario: User = {
        uid,
        email:     v.email!,
        nombre:    v.nombre!,
        telefono:  v.telefono || undefined,
        sucursalId: this.sucursalId,
        rol:       'alumno',
        activo:    true,
        fechaAlta: serverTimestamp() as any,
        alumnoData,
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

  getResumenCredito(alumno: User): string {
    const parts: string[] = [];
    const plan = alumno.alumnoData?.planContratado;
    const ind  = alumno.alumnoData?.creditoIndividual;
    if (plan) parts.push(`Plan: ${plan.clasesRestantes} clases`);
    if (ind?.clasesDisponibles) parts.push(`Individual: ${ind.clasesDisponibles} clases`);
    return parts.join(' · ') || '0 clases';
  }

  async eliminar(alumno: User): Promise<void> {
    const confirm1 = await Swal.fire({
      icon: 'warning',
      title: '¿Eliminar alumno?',
      html: `<p>Esta acción borrará permanentemente a <strong>${alumno.nombre}</strong> del sistema.</p><p>Sus turnos quedarán como historial.</p>`,
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
      await this.usuarioService.eliminar(alumno.uid);
      Swal.fire({ icon: 'success', title: 'Alumno eliminado', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    }
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
}

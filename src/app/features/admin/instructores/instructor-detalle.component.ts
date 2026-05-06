import { Component, inject, signal, OnInit, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { UsuarioService } from '../../../core/services/usuario.service';
import { TurnoService } from '../../../core/services/turno.service';
import { AusenciaService } from '../../../core/services/ausencia.service';
import { NotificacionService } from '../../../core/services/notificacion.service';
import { User, Turno, InstructorAusencia } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { WhatsappPipe } from '../../../shared/pipes/whatsapp.pipe';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';

interface DiaConfig {
  dia: number;
  nombre: string;
  activo: boolean;
  horaInicio: string;
  horaFin: string;
}

const DIAS_BASE: DiaConfig[] = [
  { dia: 1, nombre: 'Lunes',     activo: false, horaInicio: '08:00', horaFin: '18:00' },
  { dia: 2, nombre: 'Martes',    activo: false, horaInicio: '08:00', horaFin: '18:00' },
  { dia: 3, nombre: 'Miércoles', activo: false, horaInicio: '08:00', horaFin: '18:00' },
  { dia: 4, nombre: 'Jueves',    activo: false, horaInicio: '08:00', horaFin: '18:00' },
  { dia: 5, nombre: 'Viernes',   activo: false, horaInicio: '08:00', horaFin: '18:00' },
  { dia: 6, nombre: 'Sábado',    activo: false, horaInicio: '08:00', horaFin: '18:00' },
  { dia: 0, nombre: 'Domingo',   activo: false, horaInicio: '08:00', horaFin: '18:00' },
];

@Component({
  selector: 'app-instructor-detalle',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatDividerModule, MatProgressSpinnerModule,
    MatFormFieldModule, MatInputModule, MatTooltipModule,
    FechaHoraPipe, EstadoTurnoPipe, WhatsappPipe,
  ],
  templateUrl: './instructor-detalle.component.html',
  styleUrl: './instructor-detalle.component.scss',
})
export class InstructorDetalleComponent implements OnInit {
  private route           = inject(ActivatedRoute);
  private usuarioService  = inject(UsuarioService);
  private turnoService    = inject(TurnoService);
  private ausenciaService = inject(AusenciaService);
  private notifService    = inject(NotificacionService);
  private storage         = inject(Storage);
  private fb              = inject(FormBuilder);

  readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly instructor  = signal<User | null>(null);
  readonly loading     = signal(true);
  readonly guardando   = signal(false);
  readonly guardandoPersonal = signal(false);
  readonly subiendo    = signal(false);
  readonly uid         = signal('');

  readonly dias = signal<DiaConfig[]>(DIAS_BASE.map(d => ({ ...d })));

  readonly horas: string[] = (() => {
    const list: string[] = [];
    for (let i = 0; i < 29; i++) {
      const totalMin = 7 * 60 + i * 30;
      const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
      const m = totalMin % 60 === 0 ? '00' : '30';
      list.push(`${h}:${m}`);
    }
    return list;
  })();

  // Datos personales
  formPersonal = this.fb.group({
    nombre:       ['', [Validators.required, Validators.minLength(3)]],
    telefono:     [''],
    especialidad: [''],
  });

  // Disponibilidad (solo especialidad queda aquí, nombre/tel se movieron a formPersonal)
  form = this.fb.group({
    especialidad: [''],
  });

  readonly turnos = toSignal(
    this.turnoService.turnosInstructor$(this.route.snapshot.paramMap.get('id') ?? ''),
    { initialValue: [] as Turno[] }
  );
  readonly ausencias = toSignal(
    this.ausenciaService.ausenciasInstructor$(this.route.snapshot.paramMap.get('id') ?? ''),
    { initialValue: [] as InstructorAusencia[] }
  );

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.uid.set(id);
    const u = await this.usuarioService.getByIdOnce(id);
    this.instructor.set(u);
    this.cargarForm(u);
    this.loading.set(false);
  }

  private cargarForm(u: User | null): void {
    this.formPersonal.patchValue({
      nombre:       u?.nombre ?? '',
      telefono:     u?.telefono ?? '',
      especialidad: u?.instructorData?.especialidad ?? '',
    });
    this.form.patchValue({
      especialidad: u?.instructorData?.especialidad ?? '',
    });
    const horarios = u?.instructorData?.horariosDisponibles ?? [];
    this.dias.set(DIAS_BASE.map(base => {
      const guardado = horarios.find(h => h.dia === base.dia);
      return guardado
        ? { ...base, activo: true, horaInicio: guardado.horaInicio, horaFin: guardado.horaFin }
        : { ...base, activo: false };
    }));
  }

  async guardarPersonal(): Promise<void> {
    if (this.formPersonal.invalid) return;
    const v = this.formPersonal.value;
    this.guardandoPersonal.set(true);
    try {
      const u = this.instructor()!;
      await this.usuarioService.actualizar(u.uid, {
        nombre:   v.nombre!,
        telefono: v.telefono || undefined,
        instructorData: {
          ...u.instructorData!,
          especialidad: v.especialidad || undefined,
        },
      });
      const updated = await this.usuarioService.getByIdOnce(u.uid);
      this.instructor.set(updated);
      Swal.fire({ icon: 'success', title: 'Datos guardados', timer: 1200, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardandoPersonal.set(false);
    }
  }

  toggleDia(dia: number): void {
    this.dias.update(list =>
      list.map(d => d.dia === dia ? { ...d, activo: !d.activo } : d)
    );
  }

  setHoraInicio(dia: number, valor: string): void {
    this.dias.update(list =>
      list.map(d => d.dia === dia ? { ...d, horaInicio: valor } : d)
    );
  }

  setHoraFin(dia: number, valor: string): void {
    this.dias.update(list =>
      list.map(d => d.dia === dia ? { ...d, horaFin: valor } : d)
    );
  }

  async guardarHorarios(): Promise<void> {
    const horariosDisponibles = this.dias()
      .filter(d => d.activo)
      .map(d => ({ dia: d.dia, horaInicio: d.horaInicio, horaFin: d.horaFin }));

    this.guardando.set(true);
    try {
      const u = this.instructor()!;
      await this.usuarioService.actualizar(u.uid, {
        instructorData: { ...u.instructorData!, horariosDisponibles },
      });
      const updated = await this.usuarioService.getByIdOnce(u.uid);
      this.instructor.set(updated);
      Swal.fire({ icon: 'success', title: 'Disponibilidad guardada', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async aprobarAusencia(ausencia: InstructorAusencia): Promise<void> {
    await this.ausenciaService.actualizarEstado(ausencia.id!, 'aprobado');
    const fmtFecha = (ts: any) => ts.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    await this.notifService.enviar(
      ausencia.instructorUid,
      'ausencia_pendiente',
      'Ausencia aprobada',
      `Tu solicitud de ${ausencia.tipo} del ${fmtFecha(ausencia.fechaInicio)} al ${fmtFecha(ausencia.fechaFin)} fue aprobada.`,
    );
  }

  async rechazarAusencia(ausencia: InstructorAusencia): Promise<void> {
    await this.ausenciaService.actualizarEstado(ausencia.id!, 'rechazado');
  }

  triggerUpload(): void {
    this.fileInput().nativeElement.click();
  }

  async subirFoto(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      Swal.fire({ icon: 'error', title: 'Archivo inválido', text: 'Solo se permiten imágenes.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      Swal.fire({ icon: 'error', title: 'Imagen muy grande', text: 'El tamaño máximo es 5 MB.' });
      return;
    }

    const uid = this.uid();
    this.subiendo.set(true);
    try {
      const storageRef = ref(this.storage, `profile-photos/${uid}`);
      await uploadBytes(storageRef, file);
      const fotoURL = await getDownloadURL(storageRef);
      await this.usuarioService.actualizar(uid, { fotoURL });
      const updated = await this.usuarioService.getByIdOnce(uid);
      this.instructor.set(updated);
      Swal.fire({ icon: 'success', title: 'Foto actualizada', timer: 1500, showConfirmButton: false });
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error al subir foto', text: e.message });
    } finally {
      this.subiendo.set(false);
      (event.target as HTMLInputElement).value = '';
    }
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormArray, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { UsuarioService } from '../../../core/services/usuario.service';
import { TurnoService } from '../../../core/services/turno.service';
import { AusenciaService } from '../../../core/services/ausencia.service';
import { User, Turno, InstructorAusencia, HorarioDisponible } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

@Component({
  selector: 'app-instructor-detalle',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDividerModule, MatProgressSpinnerModule,
    MatSlideToggleModule, FechaHoraPipe, EstadoTurnoPipe,
  ],
  templateUrl: './instructor-detalle.component.html',
  styleUrl: './instructor-detalle.component.scss',
})
export class InstructorDetalleComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private usuarioService = inject(UsuarioService);
  private turnoService = inject(TurnoService);
  private ausenciaService = inject(AusenciaService);
  private fb = inject(FormBuilder);

  readonly DIAS = DIAS;
  readonly HORAS = Array.from({ length: 25 }, (_, i) => `${String(Math.floor(i / 2) + 7).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`).filter((_, i) => i <= 24);
  readonly diasSemana = [1, 2, 3, 4, 5, 6, 0];

  readonly instructor = signal<User | null>(null);
  readonly loading = signal(true);
  readonly guardando = signal(false);
  readonly uid = signal('');

  readonly turnos = toSignal(
    this.turnoService.turnosInstructor$(this.route.snapshot.paramMap.get('id') ?? ''),
    { initialValue: [] as Turno[] }
  );

  readonly ausencias = toSignal(
    this.ausenciaService.ausenciasInstructor$(this.route.snapshot.paramMap.get('id') ?? ''),
    { initialValue: [] as InstructorAusencia[] }
  );

  horariosForm = this.fb.group({
    horarios: this.fb.array([]),
    limiteDiario: [6, [Validators.required, Validators.min(1), Validators.max(20)]],
    especialidad: [''],
  });

  get horariosArray(): FormArray {
    return this.horariosForm.get('horarios') as FormArray;
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.uid.set(id);
    const u = await this.usuarioService.getByIdOnce(id);
    this.instructor.set(u);
    this.cargarHorarios(u);
    this.loading.set(false);
  }

  private cargarHorarios(u: User | null): void {
    this.horariosArray.clear();
    const horarios = u?.instructorData?.horariosDisponibles ?? [];
    horarios.forEach(h => this.horariosArray.push(this.crearHorarioGroup(h)));
    this.horariosForm.patchValue({
      limiteDiario: u?.instructorData?.limiteDiario ?? 6,
      especialidad: u?.instructorData?.especialidad ?? '',
    });
  }

  private crearHorarioGroup(h?: Partial<HorarioDisponible>) {
    return this.fb.group({
      dia: [h?.dia ?? 1, Validators.required],
      horaInicio: [h?.horaInicio ?? '08:00', Validators.required],
      horaFin: [h?.horaFin ?? '18:00', Validators.required],
    });
  }

  agregarHorario(): void {
    this.horariosArray.push(this.crearHorarioGroup());
  }

  quitarHorario(i: number): void {
    this.horariosArray.removeAt(i);
  }

  async guardarHorarios(): Promise<void> {
    if (this.horariosForm.invalid) return;
    const v = this.horariosForm.value;
    this.guardando.set(true);
    try {
      const u = this.instructor();
      if (!u) return;
      await this.usuarioService.actualizar(u.uid, {
        instructorData: {
          ...u.instructorData!,
          horariosDisponibles: (v.horarios as any[]).map(h => ({
            dia: Number(h.dia),
            horaInicio: h.horaInicio,
            horaFin: h.horaFin,
          })),
          limiteDiario: v.limiteDiario ?? 6,
          especialidad: v.especialidad ?? undefined,
        },
      });
      Swal.fire({ icon: 'success', title: 'Horarios actualizados', timer: 1500, showConfirmButton: false });
      const updated = await this.usuarioService.getByIdOnce(u.uid);
      this.instructor.set(updated);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: e.message });
    } finally {
      this.guardando.set(false);
    }
  }

  async aprobarAusencia(ausencia: InstructorAusencia): Promise<void> {
    await this.ausenciaService.actualizarEstado(ausencia.id!, 'aprobado');
  }

  async rechazarAusencia(ausencia: InstructorAusencia): Promise<void> {
    await this.ausenciaService.actualizarEstado(ausencia.id!, 'rechazado');
  }

  getNombreDia(dia: number): string {
    return DIAS[dia];
  }
}

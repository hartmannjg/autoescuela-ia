import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatSliderModule } from '@angular/material/slider';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import Swal from 'sweetalert2';
import { TurnoService } from '../../../core/services/turno.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { Turno } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

const TEMAS = ['Manejo en ciudad', 'Ruta y autopista', 'Estacionamiento', 'Cambio de velocidades', 'Señales de tránsito', 'Maniobras', 'Conducción nocturna', 'Lluvia y condiciones adversas', 'Repaso general'];
const AREAS_MEJORA = ['Atención en cruces', 'Uso de espejos', 'Distancia de seguimiento', 'Señalización al doblar', 'Velocidad', 'Frenado suave', 'Dirección', 'Estacionamiento'];

@Component({
  selector: 'app-evaluar-alumno',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatChipsModule, MatSliderModule, MatDividerModule, MatProgressSpinnerModule, FechaHoraPipe],
  templateUrl: './evaluar-alumno.component.html',
  styleUrl: './evaluar-alumno.component.scss',
})
export class EvaluarAlumnoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private turnoService = inject(TurnoService);
  private feedbackService = inject(FeedbackService);

  readonly turno = signal<Turno | null>(null);
  readonly loading = signal(false);
  readonly guardando = signal(false);
  readonly temas = TEMAS;
  readonly areasMejoraOpciones = AREAS_MEJORA;
  readonly areasMejoraSeleccionadas = signal<string[]>([]);
  readonly fortalezasSeleccionadas = signal<string[]>([]);
  readonly nivelAlumno = signal(3);

  contenidoForm = this.fb.group({
    temaClase: ['', Validators.required],
    descripcionClase: ['', Validators.required],
    tareaParaCasa: [''],
    recomendacionProximaClase: [''],
  });

  evaluacionForm = this.fb.group({
    comentario: ['', Validators.required],
    necesitaMasClases: [true],
    clasesRecomendadas: [null as number | null],
    aptoParaExamen: [false],
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('turnoId');
    if (!id) return;
    this.loading.set(true);
    const t = await this.turnoService.getById(id);
    this.turno.set(t);
    if (t?.temaClase) {
      this.contenidoForm.patchValue({ temaClase: t.temaClase, descripcionClase: t.descripcionClase, tareaParaCasa: t.tareaParaCasa, recomendacionProximaClase: t.recomendacionProximaClase });
      if (t.nivelAlumno) this.nivelAlumno.set(t.nivelAlumno);
    }
    this.loading.set(false);
  }

  toggleAreaMejora(area: string): void {
    this.areasMejoraSeleccionadas.update(arr =>
      arr.includes(area) ? arr.filter(a => a !== area) : [...arr, area]
    );
  }

  toggleFortaleza(f: string): void {
    this.fortalezasSeleccionadas.update(arr =>
      arr.includes(f) ? arr.filter(a => a !== f) : [...arr, f]
    );
  }

  async guardarContenido(): Promise<void> {
    if (this.contenidoForm.invalid || !this.turno()) return;
    this.guardando.set(true);
    try {
      await this.turnoService.registrarContenidoClase(this.turno()!.id!, {
        ...this.contenidoForm.value as any,
        nivelAlumno: this.nivelAlumno(),
      });
      Swal.fire({ icon: 'success', title: 'Contenido guardado', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
    } finally { this.guardando.set(false); }
  }

  async guardarEvaluacion(): Promise<void> {
    if (this.evaluacionForm.invalid || !this.turno()) return;
    this.guardando.set(true);
    try {
      const turno = this.turno()!;
      const feedbackExistente = await this.feedbackService.getByTurno(turno.id!);
      const v = this.evaluacionForm.value;

      const fbData = {
        nivelAlumno: this.nivelAlumno(),
        necesitaMasClases: v.necesitaMasClases ?? true,
        clasesRecomendadas: v.clasesRecomendadas ?? undefined,
        aptoParaExamen: v.aptoParaExamen ?? false,
        comentario: v.comentario!,
        areasMejora: this.areasMejoraSeleccionadas(),
        fortalezas: this.fortalezasSeleccionadas(),
        fechaEvaluacion: new Date() as any,
      };

      if (feedbackExistente?.id) {
        await this.feedbackService.registrarFeedbackInstructor(feedbackExistente.id, fbData);
      } else {
        const id = await this.feedbackService.crearFeedback({
          turnoId: turno.id!,
          alumnoUid: turno.alumnoUid,
          instructorUid: turno.instructorUid,
          sucursalId: turno.sucursalId,
          fechaClase: turno.fecha,
        });
        await this.feedbackService.registrarFeedbackInstructor(id, fbData);
      }

      Swal.fire({ icon: 'success', title: '¡Evaluación guardada!', confirmButtonColor: '#1b5e20' });
      this.router.navigate(['/instructor/dashboard']);
    } finally { this.guardando.set(false); }
  }
}

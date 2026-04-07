import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { FeedbackService } from '../../../core/services/feedback.service';
import { TurnoService } from '../../../core/services/turno.service';
import { FeedbackClase, Turno } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatCheckboxModule, MatProgressSpinnerModule,
    FechaHoraPipe,
  ],
  templateUrl: './feedback.component.html',
  styleUrl: './feedback.component.scss',
})
export class FeedbackComponent {
  private authService = inject(AuthService);
  private feedbackService = inject(FeedbackService);
  private turnoService = inject(TurnoService);
  private fb = inject(FormBuilder);

  readonly uid = this.authService.currentUser()?.uid ?? '';
  readonly loading = signal(false);
  readonly puntuacionSeleccionada = signal(0);

  readonly pendientes = toSignal(
    this.feedbackService.pendientesAlumno$(this.uid),
    { initialValue: [] as FeedbackClase[] }
  );

  readonly feedbackActivo = signal<FeedbackClase | null>(null);

  form = this.fb.group({
    comentario: ['', Validators.required],
    instructorRecomendado: [true],
    dificultadPercibida: [3],
  });

  seleccionarPendiente(fb: FeedbackClase): void {
    this.feedbackActivo.set(fb);
    this.puntuacionSeleccionada.set(0);
    this.form.reset({ instructorRecomendado: true, dificultadPercibida: 3 });
  }

  seleccionarEstrella(n: number): void {
    this.puntuacionSeleccionada.set(n);
  }

  async enviarFeedback(): Promise<void> {
    const fb = this.feedbackActivo();
    if (!fb?.id || !this.puntuacionSeleccionada() || this.form.invalid) return;

    this.loading.set(true);
    try {
      await this.feedbackService.registrarFeedbackAlumno(fb.id, {
        puntuacion: this.puntuacionSeleccionada() as 1|2|3|4|5,
        comentario: this.form.value.comentario!,
        instructorRecomendado: this.form.value.instructorRecomendado ?? true,
        dificultadPercibida: this.form.value.dificultadPercibida ?? 3,
        fechaCalificacion: new Date() as any,
      });
      this.feedbackActivo.set(null);
      Swal.fire({ icon: 'success', title: '¡Gracias por tu calificación!', confirmButtonColor: '#1a237e' });
    } finally {
      this.loading.set(false);
    }
  }

  getEstrellas(): number[] { return [1, 2, 3, 4, 5]; }
}

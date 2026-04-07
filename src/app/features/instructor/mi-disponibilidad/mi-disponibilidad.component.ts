import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { AusenciaService } from '../../../core/services/ausencia.service';
import { InstructorAusencia, TipoAusencia } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { dateToTs } from '../../../shared/utils/date-utils';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-mi-disponibilidad',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatNativeDateModule, MatCheckboxModule, MatChipsModule, FechaHoraPipe],
  templateUrl: './mi-disponibilidad.component.html',
  styleUrl: './mi-disponibilidad.component.scss',
})
export class MiDisponibilidadComponent {
  private authService = inject(AuthService);
  private ausenciaService = inject(AusenciaService);
  private fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly user = this.authService.currentUser;

  readonly ausencias = toSignal(
    this.ausenciaService.ausenciasInstructor$(this.authService.currentUser()?.uid ?? ''),
    { initialValue: [] as InstructorAusencia[] }
  );

  readonly tiposAusencia: { value: TipoAusencia; label: string }[] = [
    { value: 'licencia', label: 'Licencia' },
    { value: 'enfermedad', label: 'Enfermedad' },
    { value: 'tramite', label: 'Trámite' },
    { value: 'vacaciones', label: 'Vacaciones' },
    { value: 'otro', label: 'Otro' },
  ];

  form = this.fb.group({
    tipo: ['licencia' as TipoAusencia, Validators.required],
    fechaInicio: [null as Date | null, Validators.required],
    fechaFin: [null as Date | null, Validators.required],
    diaCompleto: [true],
    motivo: ['', Validators.required],
    notificarAlumnos: [true],
  });

  async registrarAusencia(): Promise<void> {
    if (this.form.invalid) return;
    const v = this.form.value;
    this.loading.set(true);
    try {
      await this.ausenciaService.crear({
        instructorUid: this.user()!.uid,
        sucursalId: this.user()!.sucursalId,
        tipo: v.tipo as TipoAusencia,
        fechaInicio: dateToTs(v.fechaInicio!) as Timestamp,
        fechaFin: dateToTs(v.fechaFin!) as Timestamp,
        diaCompleto: v.diaCompleto ?? true,
        motivo: v.motivo!,
        estado: 'pendiente',
        notificarAlumnos: v.notificarAlumnos ?? true,
      });
      this.form.reset({ tipo: 'licencia', diaCompleto: true, notificarAlumnos: true });
      Swal.fire({ icon: 'success', title: 'Ausencia registrada', text: 'Quedará pendiente de aprobación.', confirmButtonColor: '#1b5e20' });
    } finally { this.loading.set(false); }
  }
}

import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { AusenciaService } from '../../../core/services/ausencia.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { TurnoService } from '../../../core/services/turno.service';
import { InstructorAusencia, EstadoAusencia, User } from '../../../shared/models';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { slotKey } from '../../../shared/utils/date-utils';

@Component({
  selector: 'app-ausencias',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatSelectModule, MatDividerModule, MatTooltipModule, MatProgressSpinnerModule, FechaHoraPipe,
  ],
  templateUrl: './ausencias.component.html',
  styleUrl: './ausencias.component.scss',
})
export class AusenciasComponent {
  private authService = inject(AuthService);
  private ausenciaService = inject(AusenciaService);
  private usuarioService = inject(UsuarioService);
  private turnoService = inject(TurnoService);

  readonly sucursalId = this.authService.currentUser()?.sucursalId ?? '';
  readonly filtroEstado = signal<EstadoAusencia | 'todos'>('todos');
  readonly loading = signal(true);
  private _pending = 2;
  private readonly _markLoaded = () => { if (--this._pending === 0) this.loading.set(false); };

  readonly ausencias = toSignal(
    this.ausenciaService.ausenciasPorSucursal$(this.sucursalId).pipe(tap(this._markLoaded)),
    { initialValue: [] as InstructorAusencia[] }
  );

  readonly instructores = toSignal(
    this.usuarioService.instructoresPorSucursal$(this.sucursalId).pipe(tap(this._markLoaded)),
    { initialValue: [] as User[] }
  );

  readonly ausenciasFiltradas = computed(() => {
    const f = this.filtroEstado();
    if (f === 'todos') return this.ausencias();
    return this.ausencias().filter(a => a.estado === f);
  });

  readonly pendientesCount = computed(() =>
    this.ausencias().filter(a => a.estado === 'pendiente').length
  );

  getNombreInstructor(uid: string): string {
    return this.instructores().find(i => i.uid === uid)?.nombre ?? uid.substring(0, 8) + '...';
  }

  async aprobar(ausencia: InstructorAusencia): Promise<void> {
    const conf = await Swal.fire({
      icon: 'question',
      title: '¿Aprobar ausencia?',
      text: `${this.getNombreInstructor(ausencia.instructorUid)} — ${ausencia.tipo}`,
      showCancelButton: true,
      confirmButtonText: 'Aprobar',
      confirmButtonColor: '#2e7d32',
    });
    if (!conf.isConfirmed) return;

    await this.ausenciaService.actualizarEstado(ausencia.id!, 'aprobado');

    const fechas = TurnoService.expandirRango(
      ausencia.fechaInicio.toDate().toISOString().slice(0, 10),
      ausencia.fechaFin.toDate().toISOString().slice(0, 10),
    );

    let slotsEspecificos: Set<string> | undefined;
    if (!ausencia.diaCompleto && ausencia.horarioEspecifico?.length) {
      slotsEspecificos = new Set<string>();
      for (const he of ausencia.horarioEspecifico) {
        for (const hora of he.horas) {
          slotsEspecificos.add(slotKey(he.fecha, hora));
        }
      }
    }

    const motivo = `Ausencia del instructor: ${ausencia.tipo}${ausencia.motivo ? ' — ' + ausencia.motivo : ''}`;
    const cancelados = await this.turnoService.cancelarTurnosPorEvento({
      fechas,
      sucursalId: ausencia.sucursalId,
      motivo,
      instructorUid: ausencia.instructorUid,
      slotsEspecificos,
    });

    const msg = cancelados > 0
      ? `Ausencia aprobada. ${cancelados} clase${cancelados !== 1 ? 's' : ''} cancelada${cancelados !== 1 ? 's' : ''} y crédito devuelto a los alumnos.`
      : 'Ausencia aprobada. No había clases activas afectadas.';
    Swal.fire({ icon: 'success', title: 'Aprobada', text: msg, timer: 3000, showConfirmButton: false });
  }

  async rechazar(ausencia: InstructorAusencia): Promise<void> {
    const conf = await Swal.fire({
      icon: 'warning',
      title: '¿Rechazar ausencia?',
      text: `${this.getNombreInstructor(ausencia.instructorUid)} — ${ausencia.tipo}`,
      showCancelButton: true,
      confirmButtonText: 'Rechazar',
      confirmButtonColor: '#c62828',
    });
    if (conf.isConfirmed) {
      await this.ausenciaService.actualizarEstado(ausencia.id!, 'rechazado');
    }
  }

  getTipoIcon(tipo: string): string {
    const map: Record<string, string> = {
      licencia: 'card_travel', enfermedad: 'sick', tramite: 'description',
      vacaciones: 'beach_access', otro: 'event_busy',
    };
    return map[tipo] ?? 'event_busy';
  }
}

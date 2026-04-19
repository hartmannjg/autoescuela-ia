import { Component, inject, signal, OnInit, effect } from '@angular/core';
import { tap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { UsuarioService } from '../../../core/services/usuario.service';
import { QrService } from '../../../core/services/qr.service';
import { Turno } from '../../../shared/models';
import { dateToStr } from '../../../shared/utils/date-utils';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';

@Component({
  selector: 'app-marcar-asistencia',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, EstadoTurnoPipe, FechaHoraPipe],
  templateUrl: './marcar-asistencia.component.html',
  styleUrl: './marcar-asistencia.component.scss',
})
export class MarcarAsistenciaComponent {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private usuarioService = inject(UsuarioService);
  private qrService = inject(QrService);

  readonly loading = signal(false);
  readonly loadingData = signal(true);
  readonly scanMode = signal<'qr' | 'manual'>('qr');

  readonly selectedTurno = signal<Turno | null>(null);
  readonly qrImageUrl = signal<string>('');
  readonly generandoQr = signal(false);
  readonly alumnoNombres = signal<Map<string, string>>(new Map());

  readonly hoyStr = dateToStr(new Date());

  readonly turnosHoy = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? '', this.hoyStr)
      .pipe(tap(() => this.loadingData.set(false))),
    { initialValue: [] as Turno[] }
  );

  constructor() {
    effect(() => {
      const turnos = this.turnosHoy();
      const uids = [...new Set(turnos.map(t => t.alumnoUid))];
      if (!uids.length) return;
      uids.forEach(uid => {
        if (!this.alumnoNombres().has(uid)) {
          this.usuarioService.getByIdOnce(uid).then(u => {
            if (u) this.alumnoNombres.update(m => new Map(m).set(uid, u.nombre));
          });
        }
      });
    });
  }

  getNombreAlumno(uid: string): string {
    return this.alumnoNombres().get(uid) ?? uid;
  }

  async seleccionarTurno(turno: Turno): Promise<void> {
    this.selectedTurno.set(turno);
    this.qrImageUrl.set('');
    this.generandoQr.set(true);
    try {
      const url = await this.qrService.generarQrInstructor(turno.id!);
      this.qrImageUrl.set(url);
    } catch (e: any) {
      Swal.fire({ icon: 'error', title: 'Error al generar QR', text: e.message });
    } finally {
      this.generandoQr.set(false);
    }
  }

  volverALista(): void {
    this.selectedTurno.set(null);
    this.qrImageUrl.set('');
  }

  /** Retorna true si el instructor aún puede validar (hasta 1 hora después del fin) */
  puedeVerificar(turno: Turno): boolean {
    const [h, m] = turno.horaFin.split(':').map(Number);
    const [y, mo, d] = turno.fechaStr.split('-').map(Number);
    const finClase = new Date(y, mo - 1, d, h, m);
    const limite = new Date(finClase.getTime() + 60 * 60 * 1000);
    return new Date() <= limite;
  }

  async marcarManual(turno: Turno): Promise<void> {
    const result = await Swal.fire({
      title: 'Marcar asistencia manual',
      text: `¿Confirmar asistencia para la clase de las ${turno.horaInicio}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      confirmButtonColor: '#1b5e20',
    });
    if (!result.isConfirmed) return;
    this.loading.set(true);
    try {
      await this.qrService.marcarAsistenciaManual(turno.id!);
      Swal.fire({ icon: 'success', title: 'Asistencia registrada', confirmButtonColor: '#1b5e20' });
    } finally {
      this.loading.set(false);
    }
  }
}

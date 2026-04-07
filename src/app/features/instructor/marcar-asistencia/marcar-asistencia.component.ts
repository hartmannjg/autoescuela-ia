import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { TurnoService } from '../../../core/services/turno.service';
import { SucursalService } from '../../../core/services/sucursal.service';
import { QrService } from '../../../core/services/qr.service';
import { Turno, Sucursal } from '../../../shared/models';
import { dateToStr } from '../../../shared/utils/date-utils';
import { FechaHoraPipe } from '../../../shared/pipes/fecha-hora.pipe';
import { EstadoTurnoPipe } from '../../../shared/pipes/estado-turno.pipe';

@Component({
  selector: 'app-marcar-asistencia',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatDividerModule, MatProgressSpinnerModule, FechaHoraPipe, EstadoTurnoPipe],
  templateUrl: './marcar-asistencia.component.html',
  styleUrl: './marcar-asistencia.component.scss',
})
export class MarcarAsistenciaComponent implements OnDestroy {
  private authService = inject(AuthService);
  private turnoService = inject(TurnoService);
  private sucursalService = inject(SucursalService);
  private qrService = inject(QrService);

  readonly loading = signal(false);
  readonly scanMode = signal<'qr' | 'manual'>('qr');
  readonly qrResult = signal<string>('');
  readonly turnoManualId = signal('');
  readonly turnoManual = signal<Turno | null>(null);

  readonly hoyStr = dateToStr(new Date());

  readonly turnosHoy = toSignal(
    this.turnoService.turnosInstructor$(this.authService.currentUser()?.uid ?? '', this.hoyStr),
    { initialValue: [] as Turno[] }
  );

  private html5QrScanner: any = null;

  async iniciarEscaneo(): Promise<void> {
    // Importación dinámica del escáner
    const { Html5QrcodeScanner } = await import('html5-qrcode');
    this.html5QrScanner = new Html5QrcodeScanner('qr-reader', { fps: 10, qrbox: 250 }, false);
    this.html5QrScanner.render(
      (decodedText: string) => this.onQrSuccess(decodedText),
      () => {} // error silencioso
    );
  }

  private async onQrSuccess(decodedText: string): Promise<void> {
    if (this.html5QrScanner) {
      await this.html5QrScanner.clear();
      this.html5QrScanner = null;
    }

    this.loading.set(true);
    try {
      const suc = await this.sucursalService.getById(this.authService.currentUser()!.sucursalId);
      if (!suc) throw new Error('Sucursal no encontrada');

      const pos = await this.obtenerPosicion();
      const resultado = await this.qrService.validarQr(decodedText, pos, suc.ubicacion);

      if (!resultado.valido) {
        Swal.fire({ icon: 'error', title: 'QR inválido', text: resultado.motivo, confirmButtonColor: '#1b5e20' });
        return;
      }

      await this.qrService.marcarAsistenciaQr(resultado.turno!.id!);
      Swal.fire({ icon: 'success', title: '¡Asistencia registrada!', text: 'Se verificó la asistencia por QR.', confirmButtonColor: '#1b5e20' });
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#1b5e20' });
    } finally {
      this.loading.set(false);
    }
  }

  async buscarTurnoManual(): Promise<void> {
    const id = this.turnoManualId();
    if (!id) return;
    const t = await this.turnoService.getById(id);
    this.turnoManual.set(t);
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
    await this.qrService.marcarAsistenciaManual(turno.id!);
    Swal.fire({ icon: 'success', title: 'Asistencia registrada manualmente', confirmButtonColor: '#1b5e20' });
    this.turnoManual.set(null);
    this.turnoManualId.set('');
  }

  private obtenerPosicion(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('No se pudo obtener tu ubicación. Habilitá el GPS.'))
      );
    });
  }

  ngOnDestroy(): void {
    if (this.html5QrScanner) {
      this.html5QrScanner.clear().catch(() => {});
    }
  }
}

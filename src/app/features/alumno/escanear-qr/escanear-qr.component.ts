import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Html5Qrcode } from 'html5-qrcode';
import Swal from 'sweetalert2';
import { QrService } from '../../../core/services/qr.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-escanear-qr',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './escanear-qr.component.html',
  styleUrl: './escanear-qr.component.scss',
})
export class EscanearQrComponent implements OnDestroy {
  private qrService = inject(QrService);
  private authService = inject(AuthService);

  readonly escaneando = signal(false);
  readonly procesando = signal(false);
  readonly resultado = signal<{ valido: boolean; mensaje: string } | null>(null);

  private scanner: Html5Qrcode | null = null;

  async iniciarEscaneo(): Promise<void> {
    this.resultado.set(null);
    this.escaneando.set(true);

    try {
      this.scanner = new Html5Qrcode('qr-reader');
      await this.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await this.onQrDetectado(decodedText);
        },
        undefined
      );
    } catch (err: any) {
      this.escaneando.set(false);
      Swal.fire({
        icon: 'error',
        title: 'Error de cámara',
        text: err?.message ?? 'No se pudo acceder a la cámara. Verificá los permisos.',
        confirmButtonColor: '#F5A623',
        background: '#1a1a1a',
        color: '#fff',
      });
    }
  }

  private async onQrDetectado(texto: string): Promise<void> {
    await this.detenerEscaneo();
    this.procesando.set(true);

    const alumnoUid = this.authService.currentUser()?.uid;
    if (!alumnoUid) {
      this.procesando.set(false);
      return;
    }

    try {
      const res = await this.qrService.validarYMarcarQrInstructor(texto, alumnoUid);
      this.resultado.set({
        valido: res.valido,
        mensaje: res.valido
          ? `¡Asistencia registrada! Clase del ${res.turno?.fechaStr ?? ''} a las ${res.turno?.horaInicio ?? ''}.`
          : (res.motivo ?? 'QR inválido.'),
      });
    } catch (err: any) {
      this.resultado.set({ valido: false, mensaje: err?.message ?? 'Error al validar el QR.' });
    } finally {
      this.procesando.set(false);
    }
  }

  async detenerEscaneo(): Promise<void> {
    if (this.scanner) {
      try {
        await this.scanner.stop();
        this.scanner.clear();
      } catch { /* ignore */ }
      this.scanner = null;
    }
    this.escaneando.set(false);
  }

  reiniciar(): void {
    this.resultado.set(null);
  }

  ngOnDestroy(): void {
    this.detenerEscaneo();
  }
}

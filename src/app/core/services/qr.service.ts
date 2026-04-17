import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  Timestamp,
} from '@angular/fire/firestore';
import QRCode from 'qrcode';
import { Turno } from '../../shared/models';
import { TurnoService } from './turno.service';

export interface QrInstructorPayload {
  type: 'class-qr';
  turnoId: string;
}

export interface ValidacionQrResult {
  valido: boolean;
  motivo?: string;
  turno?: Turno;
}

@Injectable({ providedIn: 'root' })
export class QrService {
  private firestore = inject(Firestore);
  private turnoService = inject(TurnoService);

  /** Genera un QR que el instructor muestra y el alumno escanea */
  async generarQrInstructor(turnoId: string): Promise<string> {
    const payload: QrInstructorPayload = { type: 'class-qr', turnoId };
    return QRCode.toDataURL(JSON.stringify(payload), {
      width: 280,
      margin: 2,
      color: { dark: '#1a237e', light: '#ffffff' },
    });
  }

  /** El alumno escanea el QR del instructor: valida y marca asistencia */
  async validarYMarcarQrInstructor(
    qrData: string,
    alumnoUid: string
  ): Promise<ValidacionQrResult> {
    let payload: QrInstructorPayload;
    try {
      payload = JSON.parse(qrData);
    } catch {
      return { valido: false, motivo: 'QR inválido o corrupto.' };
    }

    if (payload.type !== 'class-qr' || !payload.turnoId) {
      return { valido: false, motivo: 'QR con formato incorrecto.' };
    }

    const snap = await getDoc(doc(this.firestore, 'turnos', payload.turnoId));
    if (!snap.exists()) {
      return { valido: false, motivo: 'Turno no encontrado.' };
    }

    const turno = { id: snap.id, ...snap.data() } as Turno;

    if (turno.alumnoUid !== alumnoUid) {
      return { valido: false, motivo: 'Este QR no corresponde a tu clase.' };
    }

    if (turno.estado !== 'CONFIRMADA') {
      return { valido: false, motivo: `La clase está en estado: ${turno.estado}` };
    }

    if (turno.asistenciaVerificada) {
      return { valido: false, motivo: 'La asistencia ya fue registrada.' };
    }

    // Verificar ventana de tiempo: desde 30 min antes del inicio hasta 1 hora después del fin
    const ahora = new Date();
    const [hFin, mFin] = turno.horaFin.split(':').map(Number);
    const [y, mo, d] = turno.fechaStr.split('-').map(Number);
    const finClase = new Date(y, mo - 1, d, hFin, mFin);
    const limiteValidacion = new Date(finClase.getTime() + 60 * 60 * 1000);

    const fechaTurno = turno.fecha instanceof Timestamp ? turno.fecha.toDate() : new Date(turno.fecha as any);
    if (ahora < new Date(fechaTurno.getTime() - 30 * 60 * 1000)) {
      return { valido: false, motivo: 'El QR solo es válido a partir de 30 minutos antes del inicio.' };
    }
    if (ahora > limiteValidacion) {
      return { valido: false, motivo: 'El tiempo para validar esta clase ya expiró (1 hora después del fin).' };
    }

    await this.turnoService.completarClase(turno.id!, 'qr');
    return { valido: true, turno };
  }

  /** Marca asistencia manual */
  async marcarAsistenciaManual(turnoId: string): Promise<void> {
    await this.turnoService.completarClase(turnoId, 'manual');
  }
}

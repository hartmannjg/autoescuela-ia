import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  getDoc,
  Timestamp,
} from '@angular/fire/firestore';
import QRCode from 'qrcode';
import { Turno } from '../../shared/models';

export interface QrPayload {
  turnoId: string;
  alumnoUid: string;
  fechaStr: string;
  horaInicio: string;
}

export interface ValidacionQrResult {
  valido: boolean;
  motivo?: string;
  turno?: Turno;
}

@Injectable({ providedIn: 'root' })
export class QrService {
  private firestore = inject(Firestore);

  /** Genera un QR como data URL para el turno */
  async generarQr(payload: QrPayload): Promise<string> {
    const data = JSON.stringify(payload);
    return QRCode.toDataURL(data, {
      width: 300,
      margin: 2,
      color: { dark: '#1a237e', light: '#ffffff' },
    });
  }

  /** Valida el QR escaneado por el instructor */
  async validarQr(
    qrData: string,
    ubicacionInstructor: { lat: number; lng: number },
    sucursalUbicacion: { lat: number; lng: number; radioPermitido: number }
  ): Promise<ValidacionQrResult> {
    let payload: QrPayload;

    try {
      payload = JSON.parse(qrData);
    } catch {
      return { valido: false, motivo: 'QR inválido o corrupto.' };
    }

    if (!payload.turnoId || !payload.alumnoUid) {
      return { valido: false, motivo: 'QR con datos incompletos.' };
    }

    // Verificar distancia
    const distancia = this.calcularDistancia(ubicacionInstructor, sucursalUbicacion);
    if (distancia > sucursalUbicacion.radioPermitido) {
      return {
        valido: false,
        motivo: `Estás a ${Math.round(distancia)}m de la sucursal. Necesitás estar a menos de ${sucursalUbicacion.radioPermitido}m.`,
      };
    }

    // Verificar turno en Firestore
    const snap = await getDoc(doc(this.firestore, 'turnos', payload.turnoId));
    if (!snap.exists()) {
      return { valido: false, motivo: 'Turno no encontrado.' };
    }

    const turno = { id: snap.id, ...snap.data() } as Turno;

    if (turno.alumnoUid !== payload.alumnoUid) {
      return { valido: false, motivo: 'El QR no corresponde a este alumno.' };
    }

    if (turno.estado !== 'CONFIRMADA') {
      return { valido: false, motivo: `El turno está en estado: ${turno.estado}` };
    }

    if (turno.asistenciaVerificada) {
      return { valido: false, motivo: 'La asistencia ya fue registrada.' };
    }

    // Verificar ventana de tiempo (±30 min)
    const ahora = new Date();
    const fechaTurno = turno.fecha instanceof Timestamp ? turno.fecha.toDate() : new Date(turno.fecha as any);
    const diff = Math.abs(ahora.getTime() - fechaTurno.getTime()) / 60000;

    if (diff > 30) {
      return { valido: false, motivo: 'El QR solo es válido 30 minutos antes y después del horario de la clase.' };
    }

    return { valido: true, turno };
  }

  /** Marca asistencia por QR */
  async marcarAsistenciaQr(turnoId: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'turnos', turnoId), {
      asistenciaVerificada: true,
      metodoVerificacion: 'qr',
    });
  }

  /** Marca asistencia manual */
  async marcarAsistenciaManual(turnoId: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'turnos', turnoId), {
      asistenciaVerificada: true,
      metodoVerificacion: 'manual',
    });
  }

  /** Calcula distancia en metros entre dos puntos (Haversine) */
  private calcularDistancia(
    p1: { lat: number; lng: number },
    p2: { lat: number; lng: number }
  ): number {
    const R = 6371000; // Radio de la Tierra en metros
    const dLat = this.toRad(p2.lat - p1.lat);
    const dLon = this.toRad(p2.lng - p1.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(p1.lat)) * Math.cos(this.toRad(p2.lat)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}

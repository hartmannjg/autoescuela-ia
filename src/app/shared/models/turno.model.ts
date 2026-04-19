import { Timestamp } from '@angular/fire/firestore';

export type TurnoEstado =
  | 'PENDIENTE_CONFIRMACION'
  | 'CONFIRMADA'
  | 'RECHAZADA'
  | 'REPROGRAMADA'
  | 'COMPLETADA'
  | 'CANCELADA'
  | 'AUSENTE';

export type TipoClase = 'plan' | 'individual' | 'cortesia';
export type ConsumidoDe = 'plan' | 'credito_individual';
export type MetodoVerificacion = 'qr' | 'manual' | 'auto';

export interface Turno {
  id?: string;
  alumnoUid: string;
  alumnoNombre?: string;
  instructorUid: string;
  sucursalId: string;
  fecha: Timestamp;
  fechaStr: string; // "2026-04-16" — para queries de calendario
  horaInicio: string; // "09:00"
  horaFin: string;   // "10:00"
  duracionMinutos: number;
  slots: string[]; // ["2026-04-16_09:00", "2026-04-16_09:20", ...]
  estado: TurnoEstado;
  tipoClase: TipoClase;
  consumidoDe: ConsumidoDe;
  notaAlumno?: string;
  motivoRechazo?: string;
  horarioSugeridoRechazo?: string;
  temaClase?: string;
  descripcionClase?: string;
  objetivosCumplidos?: string[];
  dificultadesEncontradas?: string[];
  tareaParaCasa?: string;
  nivelAlumno?: number; // 1-5
  recomendacionProximaClase?: string;
  qrCode?: string;
  qrValidoDesde?: Timestamp;
  qrValidoHasta?: Timestamp;
  asistenciaVerificada: boolean;
  metodoVerificacion?: MetodoVerificacion;
  saldoDescontado?: boolean;
  feedbackId?: string;
  creadoEn: Timestamp;
  actualizadoEn?: Timestamp;
}

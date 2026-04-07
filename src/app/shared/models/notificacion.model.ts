import { Timestamp } from '@angular/fire/firestore';

export type TipoNotificacion =
  | 'confirmacion_turno'
  | 'rechazo_turno'
  | 'recordatorio_turno'
  | 'bloqueo_cuenta'
  | 'desbloqueo_cuenta'
  | 'nueva_solicitud'
  | 'feedback_recibido'
  | 'clase_completada'
  | 'saldo_bajo'
  | 'plan_vencimiento';

export interface Notificacion {
  id?: string;
  userId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leida: boolean;
  turnoId?: string;
  creadoEn: Timestamp;
}

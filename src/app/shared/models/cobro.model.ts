import { Timestamp } from '@angular/fire/firestore';

export type TipoCobro = 'plan' | 'individual';

export interface Cobro {
  id?: string;
  sucursalId: string;
  alumnoUid: string;
  alumnoNombre: string;
  tipo: TipoCobro;
  descripcion: string;
  monto: number;
  cantidadClases?: number;
  fechaStr: string; // "2026-04-27" — para queries de rango
  creadoEn: Timestamp;
}

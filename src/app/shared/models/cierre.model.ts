import { Timestamp } from '@angular/fire/firestore';

export interface Cierre {
  id?: string;
  motivo: string;
  fechaInicio: string; // "2026-12-20"
  fechaFin: string;    // "2026-12-31"
  sucursalId?: string; // undefined = cierre global (todas las sucursales)
  activo: boolean;
  creadoEn?: Timestamp;
}

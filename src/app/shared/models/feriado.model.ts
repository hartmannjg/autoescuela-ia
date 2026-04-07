import { Timestamp } from '@angular/fire/firestore';

export type TipoFeriado = 'nacional' | 'provincial' | 'sucursal';

export interface Feriado {
  id?: string;
  nombre: string;
  fecha: string; // "2026-07-09"
  tipo: TipoFeriado;
  sucursalId?: string; // solo si tipo === 'sucursal'
  activo: boolean;
  creadoEn?: Timestamp;
}

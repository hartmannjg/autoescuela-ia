import { Timestamp } from '@angular/fire/firestore';

export type TipoFeriado = 'nacional' | 'provincial' | 'sucursal';

export interface Feriado {
  id?: string;
  nombre: string;
  fecha: string; // "2026-07-09"
  tipo: TipoFeriado;
  sucursalId?: string; // solo si tipo === 'sucursal'
  excluido_en?: string[]; // sucursalIds que optaron por no aplicar este feriado global
  recurrente?: boolean;   // si true, aplica todos los años en ese día y mes
  activo: boolean;
  creadoEn?: Timestamp;
}
import { Timestamp } from '@angular/fire/firestore';

export type TipoAusencia = 'licencia' | 'enfermedad' | 'tramite' | 'vacaciones' | 'otro';
export type EstadoAusencia = 'pendiente' | 'aprobado' | 'rechazado';

export interface HorarioEspecifico {
  fecha: string; // "2026-04-16"
  horas: string[]; // ["09:00", "09:15", ...]
}

export interface InstructorAusencia {
  id?: string;
  instructorUid: string;
  sucursalId: string;
  tipo: TipoAusencia;
  fechaInicio: Timestamp;
  fechaFin: Timestamp;
  diaCompleto: boolean;
  horarioEspecifico?: HorarioEspecifico[];
  motivo: string;
  instructorReemplazoUid?: string;
  estado: EstadoAusencia;
  notificarAlumnos: boolean;
  clasesAfectadas?: string[];
  creadoEn?: Timestamp;
}

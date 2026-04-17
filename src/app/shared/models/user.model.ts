import { Timestamp } from '@angular/fire/firestore';

export type UserRole = 'super-admin' | 'admin' | 'instructor' | 'alumno';

export interface PlanContratado {
  id: string;
  nombre: string;
  duracionClase: 40 | 80;
  clasesTotales: number;
  clasesRestantes: number;
  clasesTomadas: number;
  fechaInicio: Timestamp;
  fechaFin: Timestamp;
  valor: number;
  maxClasesPorDia: number | null; // null = sin límite
  maxClasesPorSemana: number;
}

export interface CreditoIndividual {
  clasesDisponibles: number;  // total (suma de todos los tipos)
  clasesTomadas: number;
  ultimaAsignacion?: Timestamp;
  clases40min?: number;
}

export interface AlumnoData {
  tipoAlumno: 'plan' | 'individual' | 'mixto';
  planContratado?: PlanContratado;
  creditoIndividual?: CreditoIndividual;
  bloqueado: boolean;
  bloqueadoDesde?: Timestamp;
  motivoBloqueo?: string;
  ultimaClaseFecha?: Timestamp;
  progresoGeneral?: number;
}

export interface HorarioDisponible {
  dia: number; // 0=Domingo, 1=Lunes, ..., 6=Sábado
  horaInicio: string; // "08:00"
  horaFin: string;   // "18:00"
}

export interface InstructorData {
  especialidad?: string;
  horariosDisponibles: HorarioDisponible[];
  clasesDictadas: number;
  valoracionPromedio: number;
  activo: boolean;
}

export interface User {
  uid: string;
  email: string;
  nombre: string;
  telefono?: string;
  sucursalId: string;
  rol: UserRole;
  activo: boolean;
  fechaAlta: Timestamp;
  fotoURL?: string;
  alumnoData?: AlumnoData;
  instructorData?: InstructorData;
}

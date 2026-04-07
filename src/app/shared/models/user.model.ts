import { Timestamp } from '@angular/fire/firestore';

export type UserRole = 'super-admin' | 'admin' | 'instructor' | 'alumno';

export interface PaqueteComprado {
  id: string;
  cantidadClases: number;
  precio: number;
  fechaCompra: Timestamp;
  metadoPago?: string;
}

export interface PlanContratado {
  id: string;
  nombre: string;
  duracionClaseMinutos: 30 | 45 | 60;
  clasesTotales: number;
  clasesRestantes: number;
  clasesTomadas: number;
  fechaInicio: Timestamp;
  fechaFin: Timestamp;
  valor: number;
}

export interface CreditoIndividual {
  clasesDisponibles: number;
  clasesTomadas: number;
  fechaUltimaCompra?: Timestamp;
  paquetesComprados: PaqueteComprado[];
}

export interface ReglasAsignacion {
  maxClasesPorSemana: number;
  requiereMinimoSemanal: boolean;
  semanasSinClaseMax: number;
  puedeAgendarSinLimite: boolean;
}

export interface AlumnoData {
  tipoAlumno: 'plan' | 'individual' | 'mixto';
  planContratado?: PlanContratado;
  creditoIndividual?: CreditoIndividual;
  reglasAsignacion: ReglasAsignacion;
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
  limiteDiario: number;
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

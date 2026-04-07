import { Timestamp } from '@angular/fire/firestore';

export interface AlumnoFeedback {
  puntuacion: 1 | 2 | 3 | 4 | 5;
  comentario: string;
  instructorRecomendado: boolean;
  dificultadPercibida: number; // 1-5
  fechaCalificacion: Timestamp;
}

export interface InstructorFeedback {
  nivelAlumno: number; // 1-5
  necesitaMasClases: boolean;
  clasesRecomendadas?: number;
  aptoParaExamen?: boolean;
  comentario: string;
  areasMejora: string[];
  fortalezas: string[];
  fechaEvaluacion: Timestamp;
}

export interface FeedbackClase {
  id?: string;
  turnoId: string;
  alumnoUid: string;
  instructorUid: string;
  sucursalId: string;
  fechaClase: Timestamp;
  alumnoFeedback?: AlumnoFeedback;
  instructorFeedback?: InstructorFeedback;
  creadoEn: Timestamp;
}

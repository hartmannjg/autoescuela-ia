import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { FeedbackClase, AlumnoFeedback, InstructorFeedback } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'feedbacks');

  feedbackAlumno$(alumnoUid: string): Observable<FeedbackClase[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('alumnoUid', '==', alumnoUid), orderBy('fechaClase', 'desc'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FeedbackClase));
      }, err => observer.error(err));
    });
  }

  feedbackInstructor$(instructorUid: string): Observable<FeedbackClase[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('instructorUid', '==', instructorUid), orderBy('fechaClase', 'desc'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as FeedbackClase));
      }, err => observer.error(err));
    });
  }

  async getByTurno(turnoId: string): Promise<FeedbackClase | null> {
    const q = query(this.colRef(), where('turnoId', '==', turnoId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as FeedbackClase;
  }

  async crearFeedback(feedback: Omit<FeedbackClase, 'id' | 'creadoEn'>): Promise<string> {
    const ref = await addDoc(this.colRef(), {
      ...feedback,
      creadoEn: serverTimestamp(),
    });
    return ref.id;
  }

  async registrarFeedbackAlumno(feedbackId: string, fb: AlumnoFeedback): Promise<void> {
    await updateDoc(doc(this.firestore, 'feedbacks', feedbackId), {
      alumnoFeedback: {
        ...fb,
        fechaCalificacion: serverTimestamp(),
      },
    });
  }

  async registrarFeedbackInstructor(feedbackId: string, fb: InstructorFeedback): Promise<void> {
    await updateDoc(doc(this.firestore, 'feedbacks', feedbackId), {
      instructorFeedback: {
        ...fb,
        fechaEvaluacion: serverTimestamp(),
      },
    });
  }

  /** Clases pendientes de calificar por el alumno */
  pendientesAlumno$(alumnoUid: string): Observable<FeedbackClase[]> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('alumnoUid', '==', alumnoUid),
        where('alumnoFeedback', '==', null)
      );
      return onSnapshot(q, snap => {
        observer.next(snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as FeedbackClase)
          .filter(f => !f.alumnoFeedback)
        );
      }, err => observer.error(err));
    });
  }
}

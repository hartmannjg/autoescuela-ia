import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { InstructorAusencia, EstadoAusencia } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class AusenciaService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'ausencias');

  ausenciasPorSucursal$(sucursalId: string): Observable<InstructorAusencia[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('sucursalId', '==', sucursalId), orderBy('fechaInicio', 'desc'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as InstructorAusencia));
      }, err => observer.error(err));
    });
  }

  ausenciasInstructor$(instructorUid: string): Observable<InstructorAusencia[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('instructorUid', '==', instructorUid), orderBy('fechaInicio', 'desc'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as InstructorAusencia));
      }, err => observer.error(err));
    });
  }

  async crear(ausencia: Omit<InstructorAusencia, 'id'>): Promise<string> {
    const ref = await addDoc(this.colRef(), {
      ...ausencia,
      estado: 'pendiente',
      creadoEn: serverTimestamp(),
    });
    return ref.id;
  }

  async actualizarEstado(id: string, estado: EstadoAusencia): Promise<void> {
    await updateDoc(doc(this.firestore, 'ausencias', id), { estado });
  }

}

import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Feriado } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class FeriadoService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'feriados');

  feriados$(sucursalId?: string): Observable<Feriado[]> {
    return new Observable(observer => {
      const constraints: any[] = [where('activo', '==', true), orderBy('fecha', 'asc')];
      const q = query(this.colRef(), ...constraints);
      return onSnapshot(q, snap => {
        let feriados = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Feriado);
        if (sucursalId) {
          feriados = feriados.filter(f => f.tipo !== 'sucursal' || f.sucursalId === sucursalId);
        }
        observer.next(feriados);
      }, err => observer.error(err));
    });
  }

  todos$(): Observable<Feriado[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), orderBy('fecha', 'asc'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Feriado));
      }, err => observer.error(err));
    });
  }

  async crear(feriado: Omit<Feriado, 'id'>): Promise<string> {
    const ref = await addDoc(this.colRef(), {
      ...feriado,
      creadoEn: serverTimestamp(),
    });
    return ref.id;
  }

  async actualizar(id: string, datos: Partial<Feriado>): Promise<void> {
    await updateDoc(doc(this.firestore, 'feriados', id), datos);
  }

  async eliminar(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'feriados', id));
  }

  async toggleActivo(id: string, activo: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'feriados', id), { activo });
  }

  esFeriado(fechaStr: string, feriados: Feriado[]): boolean {
    return feriados.some(f => f.activo && f.fecha === fechaStr);
  }
}

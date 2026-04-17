import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Cierre } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class CierreService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'cierres');

  /** Cierres activos que aplican a una sucursal: globales + propios de esa sucursal. */
  cierres$(sucursalId?: string): Observable<Cierre[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('activo', '==', true), orderBy('fechaInicio', 'asc'));
      return onSnapshot(q, snap => {
        let cierres = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Cierre);
        if (sucursalId) {
          cierres = cierres.filter(c => !c.sucursalId || c.sucursalId === sucursalId);
        }
        observer.next(cierres);
      }, err => observer.error(err));
    });
  }

  todos$(): Observable<Cierre[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), orderBy('fechaInicio', 'desc'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Cierre));
      }, err => observer.error(err));
    });
  }

  async crear(cierre: Omit<Cierre, 'id'>): Promise<string> {
    const ref = await addDoc(this.colRef(), { ...cierre, creadoEn: serverTimestamp() });
    return ref.id;
  }

  async eliminar(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'cierres', id));
  }

  async toggleActivo(id: string, activo: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'cierres', id), { activo });
  }

  estaEnCierre(fechaStr: string, cierres: Cierre[]): boolean {
    return cierres.some(c => c.activo && fechaStr >= c.fechaInicio && fechaStr <= c.fechaFin);
  }
}

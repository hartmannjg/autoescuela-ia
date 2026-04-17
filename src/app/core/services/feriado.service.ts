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
  arrayUnion,
  arrayRemove,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Feriado } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class FeriadoService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'feriados');

  feriados$(sucursalId?: string): Observable<Feriado[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('activo', '==', true), orderBy('fecha', 'asc'));
      return onSnapshot(q, snap => {
        let feriados = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Feriado);
        if (sucursalId) {
          feriados = feriados.filter(f => {
            if (f.tipo === 'sucursal') return f.sucursalId === sucursalId;
            return !(f.excluido_en ?? []).includes(sucursalId);
          });
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

  async excluirEnSucursal(feriadoId: string, sucursalId: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'feriados', feriadoId), {
      excluido_en: arrayUnion(sucursalId),
    });
  }

  async reincluirEnSucursal(feriadoId: string, sucursalId: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'feriados', feriadoId), {
      excluido_en: arrayRemove(sucursalId),
    });
  }

  esFeriado(fechaStr: string, feriados: Feriado[]): boolean {
    const mmdd = fechaStr.slice(5); // "MM-DD"
    return feriados.some(f => {
      if (!f.activo) return false;
      return f.recurrente ? f.fecha.slice(5) === mmdd : f.fecha === fechaStr;
    });
  }
}
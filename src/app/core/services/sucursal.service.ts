import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Sucursal } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class SucursalService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'sucursales');

  sucursales$(): Observable<Sucursal[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('activo', '==', true));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Sucursal));
      }, err => observer.error(err));
    });
  }

  todasLasSucursales$(): Observable<Sucursal[]> {
    return new Observable(observer => {
      return onSnapshot(this.colRef(), snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Sucursal));
      }, err => observer.error(err));
    });
  }

  async getById(id: string): Promise<Sucursal | null> {
    const snap = await getDoc(doc(this.firestore, 'sucursales', id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Sucursal) : null;
  }

  async crear(sucursal: Omit<Sucursal, 'id'>): Promise<string> {
    const ref = await addDoc(this.colRef(), {
      ...sucursal,
      creadoEn: serverTimestamp(),
      actualizadoEn: serverTimestamp(),
    });
    return ref.id;
  }

  async actualizar(id: string, datos: Partial<Sucursal>): Promise<void> {
    await updateDoc(doc(this.firestore, 'sucursales', id), {
      ...datos,
      actualizadoEn: serverTimestamp(),
    });
  }

  async toggleActivo(id: string, activo: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'sucursales', id), { activo });
  }
}

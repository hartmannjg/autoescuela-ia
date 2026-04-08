import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { User, AlumnoData } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'users');

  getById(uid: string): Observable<User | null> {
    return new Observable(observer => {
      return onSnapshot(doc(this.firestore, 'users', uid), snap => {
        observer.next(snap.exists() ? (snap.data() as User) : null);
      }, err => observer.error(err));
    });
  }

  async getByIdOnce(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    return snap.exists() ? (snap.data() as User) : null;
  }

  // Sin orderBy — evita índices compuestos, ordenamos en el cliente
  alumnosPorSucursal$(sucursalId: string): Observable<User[]> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('sucursalId', '==', sucursalId),
        where('rol', '==', 'alumno')
      );
      return onSnapshot(q, snap => {
        const users = snap.docs.map(d => d.data() as User)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        observer.next(users);
      }, err => observer.error(err));
    });
  }

  instructoresPorSucursal$(sucursalId: string): Observable<User[]> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('sucursalId', '==', sucursalId),
        where('rol', '==', 'instructor')
      );
      return onSnapshot(q, snap => {
        const users = snap.docs.map(d => d.data() as User)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        observer.next(users);
      }, err => observer.error(err));
    });
  }

  instructoresActivos$(sucursalId: string): Observable<User[]> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('sucursalId', '==', sucursalId),
        where('rol', '==', 'instructor')
      );
      return onSnapshot(q, snap => {
        const users = snap.docs.map(d => d.data() as User)
          .filter(u => u.instructorData?.activo)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        observer.next(users);
      }, err => observer.error(err));
    });
  }

  async actualizar(uid: string, datos: Partial<User>): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), {
      ...datos,
      actualizadoEn: serverTimestamp(),
    });
  }

  async actualizarAlumnoData(uid: string, alumnoData: Partial<AlumnoData>): Promise<void> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    if (!snap.exists()) throw new Error('Usuario no encontrado');
    const user = snap.data() as User;
    await updateDoc(doc(this.firestore, 'users', uid), {
      alumnoData: { ...user.alumnoData, ...alumnoData },
    });
  }

  async bloquearAlumno(uid: string, motivo: string): Promise<void> {
    await this.actualizarAlumnoData(uid, {
      bloqueado: true,
      bloqueadoDesde: serverTimestamp() as any,
      motivoBloqueo: motivo,
    });
  }

  async desbloquearAlumno(uid: string): Promise<void> {
    await this.actualizarAlumnoData(uid, {
      bloqueado: false,
      bloqueadoDesde: undefined,
      motivoBloqueo: undefined,
    });
  }

  async recargarCredito(uid: string, clases: number): Promise<void> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    if (!snap.exists()) throw new Error('Usuario no encontrado');
    const user = snap.data() as User;
    const credito = user.alumnoData?.creditoIndividual;
    if (!credito) throw new Error('El alumno no tiene crédito individual');
    await this.actualizarAlumnoData(uid, {
      creditoIndividual: {
        ...credito,
        clasesDisponibles: (credito.clasesDisponibles ?? 0) + clases,
      },
    });
  }

  async activarDesactivar(uid: string, activo: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), { activo });
  }
}

import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { User, AlumnoData, PlanContratado } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
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

  alumnosPorSucursal$(sucursalId: string): Observable<User[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('sucursalId', '==', sucursalId), where('rol', '==', 'alumno'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => d.data() as User).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      }, err => observer.error(err));
    });
  }

  adminsPorSucursal$(sucursalId: string): Observable<User[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('sucursalId', '==', sucursalId), where('rol', '==', 'admin'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => d.data() as User).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      }, err => observer.error(err));
    });
  }

  instructoresPorSucursal$(sucursalId: string): Observable<User[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('sucursalId', '==', sucursalId), where('rol', '==', 'instructor'));
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => d.data() as User).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      }, err => observer.error(err));
    });
  }

  instructoresActivos$(sucursalId: string): Observable<User[]> {
    return new Observable(observer => {
      const q = query(this.colRef(), where('sucursalId', '==', sucursalId), where('rol', '==', 'instructor'));
      return onSnapshot(q, snap => {
        observer.next(
          snap.docs.map(d => d.data() as User)
            .filter(u => u.instructorData?.activo)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        );
      }, err => observer.error(err));
    });
  }

  async actualizar(uid: string, datos: Partial<User>): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), { ...datos, actualizadoEn: serverTimestamp() });
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

  /** Asigna clases individuales de 40 min al alumno */
  async asignarClasesIndividuales(uid: string, clases: number): Promise<void> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    if (!snap.exists()) throw new Error('Usuario no encontrado');
    const user = snap.data() as User;
    const actual = user.alumnoData?.creditoIndividual;
    const nuevoCredito = {
      clasesDisponibles: (actual?.clasesDisponibles ?? 0) + clases,
      clasesTomadas:     actual?.clasesTomadas ?? 0,
      ultimaAsignacion:  serverTimestamp() as any,
      clases40min: (actual?.clases40min ?? 0) + clases,
    };
    await this.actualizarAlumnoData(uid, { creditoIndividual: nuevoCredito });
  }

  /** Quita clases individuales de 40 min del saldo del alumno */
  async quitarClasesIndividuales(uid: string, clases: number): Promise<void> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    if (!snap.exists()) throw new Error('Usuario no encontrado');
    const user = snap.data() as User;
    const actual = user.alumnoData?.creditoIndividual;
    const disponibles = actual?.clasesDisponibles ?? 0;
    if (clases > disponibles) throw new Error(`Solo hay ${disponibles} clases disponibles.`);
    const nuevoCredito = {
      clasesDisponibles: disponibles - clases,
      clasesTomadas:     actual?.clasesTomadas ?? 0,
      ultimaAsignacion:  actual?.ultimaAsignacion,
      clases40min: Math.max(0, (actual?.clases40min ?? 0) - clases),
    };
    await this.actualizarAlumnoData(uid, { creditoIndividual: nuevoCredito });
  }

  async activarDesactivar(uid: string, activo: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), { activo });
  }

  /** Asigna un plan al alumno. Reemplaza el plan anterior. */
  async asignarPlan(uid: string, plan: PlanContratado): Promise<void> {
    await this.actualizarAlumnoData(uid, { planContratado: plan });
  }

  /**
   * Elimina permanentemente un usuario.
   * TODO (Blaze): reemplazar por httpsCallable('eliminarUsuario') para borrar también el Auth account.
   * Por ahora solo borra el doc de Firestore; el Auth account queda huérfano pero sin acceso a la app.
   */
  async eliminar(uid: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'users', uid));
  }

  /** Quita el plan actual del alumno. */
  async quitarPlan(uid: string): Promise<void> {
    const snap = await getDoc(doc(this.firestore, 'users', uid));
    if (!snap.exists()) throw new Error('Usuario no encontrado');
    const user = snap.data() as User;
    if (!user.alumnoData) throw new Error('Sin alumnoData');
    const { planContratado: _, ...sinPlan } = user.alumnoData;
    await updateDoc(doc(this.firestore, 'users', uid), {
      alumnoData: sinPlan,
      actualizadoEn: serverTimestamp(),
    });
  }
}

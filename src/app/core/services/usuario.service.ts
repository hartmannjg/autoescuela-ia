import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
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

  /** Asigna clases individuales de 40 min al alumno y registra la transacción de ingreso */
  async asignarClasesIndividuales(uid: string, clases: number, precio: number, sucursalId: string, alumnoNombre: string): Promise<void> {
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
    const hoy = new Date();
    const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    await addDoc(collection(this.firestore, 'cobros'), {
      sucursalId, alumnoUid: uid, alumnoNombre,
      tipo: 'individual',
      descripcion: `${clases} clase${clases !== 1 ? 's' : ''} individual${clases !== 1 ? 'es' : ''} (40 min)`,
      monto: precio, cantidadClases: clases,
      fechaStr, creadoEn: serverTimestamp(),
    });
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

  /** Asigna un plan al alumno y registra la transacción de ingreso */
  async asignarPlan(uid: string, plan: PlanContratado, sucursalId: string, alumnoNombre: string): Promise<void> {
    await this.actualizarAlumnoData(uid, { planContratado: plan });
    const hoy = new Date();
    const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    await addDoc(collection(this.firestore, 'cobros'), {
      sucursalId, alumnoUid: uid, alumnoNombre,
      tipo: 'plan',
      descripcion: `${plan.nombre} (${plan.clasesTotales} clases)`,
      monto: plan.valor ?? 0, cantidadClases: plan.clasesTotales,
      fechaStr, creadoEn: serverTimestamp(),
    });
  }

  /** Extiende solo la fechaFin del plan actual sin tocar clases ni historial. */
  async extenderPlan(uid: string, nuevaFechaFin: Date): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), {
      'alumnoData.planContratado.fechaFin': Timestamp.fromDate(nuevaFechaFin),
      'alumnoData.planContratado.semanasInactivas': 0,
    });
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

  /**
   * Elimina todos los cobros del día actual para este alumno y tipo.
   * Solo aplica si el cobro fue generado hoy (error de carga).
   * Devuelve true si se revirtió al menos uno.
   */
  async revertirCobroDelDia(alumnoUid: string, tipo: 'plan' | 'individual', sucursalId: string): Promise<boolean> {
    const hoy = new Date();
    const fechaStr = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
    const snap = await getDocs(query(
      collection(this.firestore, 'cobros'),
      where('alumnoUid', '==', alumnoUid),
      where('fechaStr', '==', fechaStr)
    ));
    const aEliminar = snap.docs.filter(d => d.data()['tipo'] === tipo && d.data()['sucursalId'] === sucursalId);
    if (!aEliminar.length) return false;
    await Promise.all(aEliminar.map(d => deleteDoc(d.ref)));
    return true;
  }
}

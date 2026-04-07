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
  getDocs,
  getDoc,
  Timestamp,
  serverTimestamp,
  runTransaction,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Turno, TurnoEstado } from '../../shared/models';
import { generarSlots, calcularHoraFin, dateToStr } from '../../shared/utils/date-utils';

@Injectable({ providedIn: 'root' })
export class TurnoService {
  private firestore = inject(Firestore);
  private colRef = () => collection(this.firestore, 'turnos');

  /** Obtiene turnos de un alumno en tiempo real */
  turnosAlumno$(alumnoUid: string, estado?: TurnoEstado): Observable<Turno[]> {
    return new Observable(observer => {
      const constraints: any[] = [where('alumnoUid', '==', alumnoUid), orderBy('fecha', 'desc')];
      if (estado) constraints.push(where('estado', '==', estado));
      const q = query(this.colRef(), ...constraints);
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Turno));
      }, err => observer.error(err));
    });
  }

  /** Obtiene turnos de un instructor en tiempo real */
  turnosInstructor$(instructorUid: string, fechaStr?: string): Observable<Turno[]> {
    return new Observable(observer => {
      const constraints: any[] = [where('instructorUid', '==', instructorUid)];
      if (fechaStr) constraints.push(where('fechaStr', '==', fechaStr));
      constraints.push(orderBy('fecha', 'asc'));
      const q = query(this.colRef(), ...constraints);
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Turno));
      }, err => observer.error(err));
    });
  }

  /** Obtiene turnos por sucursal y rango de fechas */
  turnosSucursal$(sucursalId: string, desde: string, hasta: string): Observable<Turno[]> {
    return new Observable(observer => {
      const q = query(
        this.colRef(),
        where('sucursalId', '==', sucursalId),
        where('fechaStr', '>=', desde),
        where('fechaStr', '<=', hasta),
        orderBy('fechaStr', 'asc'),
        orderBy('horaInicio', 'asc')
      );
      return onSnapshot(q, snap => {
        observer.next(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Turno));
      }, err => observer.error(err));
    });
  }

  /** Crea un turno con validación atómica de slots */
  async crearTurno(turno: Omit<Turno, 'id' | 'creadoEn' | 'slots' | 'horaFin'>): Promise<string> {
    const slots = generarSlots(turno.fechaStr, turno.horaInicio, turno.duracionMinutos);
    const horaFin = calcularHoraFin(turno.horaInicio, turno.duracionMinutos);

    const nuevoTurno: Omit<Turno, 'id'> = {
      ...turno,
      slots,
      horaFin,
      estado: 'PENDIENTE_CONFIRMACION',
      asistenciaVerificada: false,
      creadoEn: serverTimestamp() as Timestamp,
      actualizadoEn: serverTimestamp() as Timestamp,
    };

    // Validación atómica: verifica que los slots estén libres
    const turnoId = await runTransaction(this.firestore, async (tx) => {
      // Buscar turnos existentes que usen alguno de estos slots
      const q = query(
        this.colRef(),
        where('instructorUid', '==', turno.instructorUid),
        where('fechaStr', '==', turno.fechaStr),
        where('estado', 'in', ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'])
      );
      const snap = await getDocs(q);
      const slotsOcupados = new Set<string>();
      snap.docs.forEach(d => {
        const t = d.data() as Turno;
        t.slots?.forEach(s => slotsOcupados.add(s));
      });

      const conflicto = slots.some(s => slotsOcupados.has(s));
      if (conflicto) throw new Error('El horario seleccionado ya no está disponible. Por favor elegí otro.');

      const ref = doc(this.colRef());
      tx.set(ref, nuevoTurno);
      return ref.id;
    });

    return turnoId;
  }

  /** Actualiza el estado de un turno */
  async actualizarEstado(
    turnoId: string,
    estado: TurnoEstado,
    datos?: Partial<Turno>
  ): Promise<void> {
    await updateDoc(doc(this.firestore, 'turnos', turnoId), {
      estado,
      ...(datos ?? {}),
      actualizadoEn: serverTimestamp(),
    });
  }

  /** Cancela un turno (alumno o admin) */
  async cancelarTurno(turnoId: string): Promise<void> {
    await this.actualizarEstado(turnoId, 'CANCELADA');
  }

  /** Confirma un turno (instructor) */
  async confirmarTurno(turnoId: string): Promise<void> {
    await this.actualizarEstado(turnoId, 'CONFIRMADA');
  }

  /** Rechaza un turno (instructor) */
  async rechazarTurno(turnoId: string, motivo: string, horarioSugerido?: string): Promise<void> {
    await this.actualizarEstado(turnoId, 'RECHAZADA', {
      motivoRechazo: motivo,
      horarioSugeridoRechazo: horarioSugerido,
    });
  }

  /** Registra el contenido de la clase (instructor) */
  async registrarContenidoClase(turnoId: string, contenido: Partial<Turno>): Promise<void> {
    await updateDoc(doc(this.firestore, 'turnos', turnoId), {
      ...contenido,
      estado: 'COMPLETADA',
      actualizadoEn: serverTimestamp(),
    });
  }

  /** Obtiene los slots ocupados para un instructor en un día */
  async getSlotsOcupados(instructorUid: string, fechaStr: string): Promise<Set<string>> {
    const q = query(
      this.colRef(),
      where('instructorUid', '==', instructorUid),
      where('fechaStr', '==', fechaStr),
      where('estado', 'in', ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'])
    );
    const snap = await getDocs(q);
    const ocupados = new Set<string>();
    snap.docs.forEach(d => {
      const t = d.data() as Turno;
      t.slots?.forEach(s => ocupados.add(s));
    });
    return ocupados;
  }

  async getById(turnoId: string): Promise<Turno | null> {
    const snap = await getDoc(doc(this.firestore, 'turnos', turnoId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Turno) : null;
  }
}

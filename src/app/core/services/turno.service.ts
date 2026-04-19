import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
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
  increment,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { Turno, TurnoEstado, MetodoVerificacion, User } from '../../shared/models';
import { generarSlots, calcularHoraFin, getSemanaStr, getSemanaBounds } from '../../shared/utils/date-utils';
import { NotificacionService } from './notificacion.service';
import { ConfiguracionService } from './configuracion.service';

@Injectable({ providedIn: 'root' })
export class TurnoService {
  private firestore = inject(Firestore);
  private notificacionService = inject(NotificacionService);
  private configuracionService = inject(ConfiguracionService);
  private colRef = () => collection(this.firestore, 'turnos');

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

  /** Crea un turno, valida saldo disponible y lo descuenta al agendar. */
  async crearTurno(turno: Omit<Turno, 'id' | 'creadoEn' | 'slots' | 'horaFin'>): Promise<string> {
    const slots = generarSlots(turno.fechaStr, turno.horaInicio, turno.duracionMinutos);
    const horaFin = calcularHoraFin(turno.horaInicio, turno.duracionMinutos);

    // ── VALIDACIÓN DE SLOTS (fuera de la transacción — getDocs no es compatible con tx) ──
    const semanaStr = getSemanaStr(turno.fechaStr);
    const [slotsOcupados, slotsAlumno, clasesDia, clasesSemana, reagendasSemana, config] = await Promise.all([
      this.getSlotsOcupados(turno.instructorUid, turno.fechaStr),
      this.getSlotsAlumno(turno.alumnoUid, turno.fechaStr),
      this.contarClasesAlumnoEnFecha(turno.alumnoUid, turno.fechaStr),
      this.contarClasesAlumnoEnSemana(turno.alumnoUid, semanaStr),
      this.contarReagendasAlumnoEnSemana(turno.alumnoUid, semanaStr),
      this.configuracionService.getOnce(),
    ]);
    if (slots.some(s => slotsOcupados.has(s))) {
      throw new Error('El horario seleccionado ya no está disponible. Por favor elegí otro.');
    }
    if (slots.some(s => slotsAlumno.has(s))) {
      throw new Error('Ya tenés una clase agendada que se solapa con ese horario.');
    }
    const configSuc = await this.configuracionService.getSucursalOnce(turno.sucursalId);
    const maxReagendas = configSuc?.maxReagendasPorSemana ?? config?.limites?.maxReagendasPorSemana ?? 4;
    if (reagendasSemana >= maxReagendas) {
      throw new Error(`Alcanzaste el límite de ${maxReagendas} reagendas por semana. Podés volver a agendar el próximo lunes.`);
    }

    // ── VALIDACIÓN DE LÍMITES DEL PLAN ──────────────────────────────────────────
    // Solo aplica cuando se consume del plan; crédito individual no tiene límites de frecuencia
    if (turno.consumidoDe === 'plan') {
      // Necesitamos leer el plan del alumno para conocer sus límites; lo hacemos via getDocs
      const alumnoSnap0 = await getDoc(doc(this.firestore, 'users', turno.alumnoUid));
      const plan = (alumnoSnap0.data() as User).alumnoData?.planContratado;
      if (plan) {
        if (plan.maxClasesPorDia !== null && clasesDia >= plan.maxClasesPorDia) {
          throw new Error(`Tu plan permite máximo ${plan.maxClasesPorDia} clase${plan.maxClasesPorDia > 1 ? 's' : ''} por día.`);
        }
        if (clasesSemana >= plan.maxClasesPorSemana) {
          throw new Error(`Tu plan permite máximo ${plan.maxClasesPorSemana} clase${plan.maxClasesPorSemana > 1 ? 's' : ''} por semana.`);
        }
      }
    }

    const alumnoDocSnap = await getDoc(doc(this.firestore, 'users', turno.alumnoUid));
    const alumnoNombre = alumnoDocSnap.exists() ? (alumnoDocSnap.data() as User).nombre : turno.alumnoUid;

    const nuevoTurno: Omit<Turno, 'id'> = {
      ...turno,
      alumnoNombre,
      slots,
      horaFin,
      asistenciaVerificada: false,
      saldoDescontado: true,
      creadoEn: serverTimestamp() as Timestamp,
      actualizadoEn: serverTimestamp() as Timestamp,
    };

    // ── TRANSACCIÓN: solo tx.get + tx.update + tx.set ───────────────────────
    const turnoId = await runTransaction(this.firestore, async (tx) => {
      const alumnoRef  = doc(this.firestore, 'users', turno.alumnoUid);
      const alumnoSnap = await tx.get(alumnoRef);
      if (!alumnoSnap.exists()) throw new Error('Alumno no encontrado.');
      const ad = (alumnoSnap.data() as User).alumnoData;
      if (!ad) throw new Error('El alumno no tiene datos de cuenta.');

      // Validar y descontar saldo
      if (turno.consumidoDe === 'plan') {
        const plan = ad.planContratado;
        if (!plan || plan.clasesRestantes <= 0) {
          throw new Error('No tenés clases disponibles en tu plan.');
        }
        tx.update(alumnoRef, {
          'alumnoData.planContratado.clasesRestantes': increment(-1),
          'alumnoData.planContratado.clasesTomadas': increment(1),
          'alumnoData.ultimaClaseFecha': serverTimestamp(),
        });
      } else if (turno.consumidoDe === 'credito_individual') {
        const ci = ad.creditoIndividual;
        if (!ci || ci.clasesDisponibles <= 0) {
          throw new Error('No tenés créditos individuales disponibles.');
        }
        tx.update(alumnoRef, this.creditoIndividualPatch(ad, turno.duracionMinutos));
      }

      const ref = doc(this.colRef());
      tx.set(ref, nuevoTurno);
      return ref.id;
    });

    // Notificar al instructor fuera de la transacción
    const fechaLegible = new Date(turno.fechaStr + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    await this.notificacionService.enviar(
      turno.instructorUid,
      'nueva_solicitud',
      'Nueva clase agendada',
      `${alumnoNombre} agendó una clase para el ${fechaLegible} a las ${turno.horaInicio} (${turno.duracionMinutos} min).`,
      turnoId,
    );

    return turnoId;
  }

  async actualizarEstado(turnoId: string, estado: TurnoEstado, datos?: Partial<Turno>): Promise<void> {
    // Firestore rechaza campos con valor undefined — los filtramos antes de escribir
    const extra = Object.fromEntries(
      Object.entries(datos ?? {}).filter(([, v]) => v !== undefined)
    );
    await updateDoc(doc(this.firestore, 'turnos', turnoId), {
      estado,
      ...extra,
      actualizadoEn: serverTimestamp(),
    });
  }

  /** Cancela un turno y devuelve el saldo al alumno. */
  async cancelarTurno(turnoId: string, motivo?: string): Promise<void> {
    await runTransaction(this.firestore, async (tx) => {
      // ── TODAS LAS LECTURAS PRIMERO (requisito de Firestore transactions) ──
      const turnoRef  = doc(this.firestore, 'turnos', turnoId);
      const turnoSnap = await tx.get(turnoRef);
      if (!turnoSnap.exists()) throw new Error('Turno no encontrado.');
      const turno = turnoSnap.data() as Turno;

      const alumnoRef  = doc(this.firestore, 'users', turno.alumnoUid);
      const alumnoSnap = turno.saldoDescontado ? await tx.get(alumnoRef) : null;

      // ── ESCRITURAS DESPUÉS DE TODAS LAS LECTURAS ──
      tx.update(turnoRef, { estado: 'CANCELADA', ...(motivo ? { motivoRechazo: motivo } : {}), actualizadoEn: serverTimestamp() });

      // Devolver saldo solo si fue descontado al agendar
      if (!turno.saldoDescontado || !alumnoSnap?.exists()) return;
      const ad = (alumnoSnap.data() as User).alumnoData;
      if (!ad) return;

      if (turno.consumidoDe === 'plan' && ad.planContratado) {
        tx.update(alumnoRef, {
          'alumnoData.planContratado.clasesRestantes': increment(1),
          'alumnoData.planContratado.clasesTomadas': increment(-1),
        });
      } else if (turno.consumidoDe === 'credito_individual' && ad.creditoIndividual) {
        const patch: Record<string, any> = {
          'alumnoData.creditoIndividual.clasesDisponibles': increment(1),
          'alumnoData.creditoIndividual.clasesTomadas': increment(-1),
        };
        if (turno.duracionMinutos === 20)
          patch['alumnoData.creditoIndividual.clases20min'] = increment(1);
        else if (turno.duracionMinutos === 40)
          patch['alumnoData.creditoIndividual.clases40min'] = increment(1);
        else if (turno.duracionMinutos === 60)
          patch['alumnoData.creditoIndividual.clases60min'] = increment(1);
        tx.update(alumnoRef, patch);
      }
    });
  }

  async confirmarTurno(turnoId: string): Promise<void> {
    await this.actualizarEstado(turnoId, 'CONFIRMADA');
  }

  /** Elimina un turno CANCELADA. El saldo ya fue devuelto al cancelar. */
  async eliminarTurnoCancelado(turnoId: string): Promise<void> {
    const snap = await getDoc(doc(this.firestore, 'turnos', turnoId));
    if (!snap.exists()) throw new Error('Turno no encontrado.');
    if ((snap.data() as Turno).estado !== 'CANCELADA')
      throw new Error('Solo se pueden eliminar turnos cancelados.');
    await deleteDoc(doc(this.firestore, 'turnos', turnoId));
  }

  async rechazarTurno(turnoId: string, motivo: string, horarioSugerido?: string): Promise<void> {
    await runTransaction(this.firestore, async (tx) => {
      // ── LECTURAS PRIMERO ──
      const turnoRef  = doc(this.firestore, 'turnos', turnoId);
      const turnoSnap = await tx.get(turnoRef);
      if (!turnoSnap.exists()) throw new Error('Turno no encontrado.');
      const turno = turnoSnap.data() as Turno;

      const alumnoRef  = doc(this.firestore, 'users', turno.alumnoUid);
      const alumnoSnap = turno.saldoDescontado ? await tx.get(alumnoRef) : null;

      // ── ESCRITURAS ──
      const updateData: Record<string, any> = {
        estado: 'RECHAZADA',
        motivoRechazo: motivo,
        actualizadoEn: serverTimestamp(),
      };
      if (horarioSugerido) updateData['horarioSugeridoRechazo'] = horarioSugerido;
      tx.update(turnoRef, updateData);

      // Devolver saldo al alumno (fue descontado al crear el turno)
      if (!turno.saldoDescontado || !alumnoSnap?.exists()) return;
      const ad = (alumnoSnap.data() as User).alumnoData;
      if (!ad) return;

      if (turno.consumidoDe === 'plan' && ad.planContratado) {
        tx.update(alumnoRef, {
          'alumnoData.planContratado.clasesRestantes': increment(1),
          'alumnoData.planContratado.clasesTomadas': increment(-1),
        });
      } else if (turno.consumidoDe === 'credito_individual' && ad.creditoIndividual) {
        const patch: Record<string, any> = {
          'alumnoData.creditoIndividual.clasesDisponibles': increment(1),
          'alumnoData.creditoIndividual.clasesTomadas': increment(-1),
        };
        if (turno.duracionMinutos === 20)
          patch['alumnoData.creditoIndividual.clases20min'] = increment(1);
        else if (turno.duracionMinutos === 40)
          patch['alumnoData.creditoIndividual.clases40min'] = increment(1);
        else if (turno.duracionMinutos === 60)
          patch['alumnoData.creditoIndividual.clases60min'] = increment(1);
        tx.update(alumnoRef, patch);
      }
    });

    // Notificar al alumno fuera de la transacción (no es crítico para la atomicidad)
    const turnoSnap = await getDoc(doc(this.firestore, 'turnos', turnoId));
    if (turnoSnap.exists()) {
      const turno = turnoSnap.data() as Turno;
      const fechaLegible = turno.fechaStr
        ? new Date(turno.fechaStr + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      const horario = `${turno.horaInicio} (${turno.duracionMinutos} min)`;
      const devolucion = turno.saldoDescontado
        ? turno.consumidoDe === 'plan'
          ? 'Tu clase fue devuelta al plan.'
          : 'Tu crédito fue reintegrado.'
        : '';
      const motivoTexto = motivo ? ` Motivo: ${motivo}.` : '';
      const sugerido = horarioSugerido ? ` Horario sugerido por el instructor: ${horarioSugerido}.` : '';
      await this.notificacionService.enviar(
        turno.alumnoUid,
        'rechazo_turno',
        'Clase rechazada',
        `Tu clase del ${fechaLegible} a las ${horario} fue rechazada.${motivoTexto}${sugerido} ${devolucion}`.trim(),
        turnoId,
      );
    }
  }

  /**
   * El instructor registra el contenido de la clase → llama completarClase
   * para garantizar que el saldo se descuente.
   */
  async registrarContenidoClase(turnoId: string, contenido: Partial<Turno>): Promise<void> {
    // Primero guardamos el contenido pedagógico
    await updateDoc(doc(this.firestore, 'turnos', turnoId), {
      ...contenido,
      actualizadoEn: serverTimestamp(),
    });
    // Luego completamos (descuenta saldo, guard interno evita doble descuento)
    await this.completarClase(turnoId, 'manual');
  }

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

  /** Cuenta clases activas (PENDIENTE/CONFIRMADA) del alumno en un día */
  private async contarClasesAlumnoEnFecha(alumnoUid: string, fechaStr: string): Promise<number> {
    const q = query(
      this.colRef(),
      where('alumnoUid', '==', alumnoUid),
      where('fechaStr', '==', fechaStr),
      where('estado', 'in', ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'])
    );
    const snap = await getDocs(q);
    return snap.size;
  }

  /** Cuenta clases activas (PENDIENTE/CONFIRMADA) del alumno en una semana ISO */
  private async contarClasesAlumnoEnSemana(alumnoUid: string, semanaStr: string): Promise<number> {
    const { lunes, domingo } = getSemanaBounds(semanaStr);
    const q = query(
      this.colRef(),
      where('alumnoUid', '==', alumnoUid),
      where('fechaStr', '>=', lunes),
      where('fechaStr', '<=', domingo),
      where('estado', 'in', ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'])
    );
    const snap = await getDocs(q);
    return snap.size;
  }

  private async contarReagendasAlumnoEnSemana(alumnoUid: string, semanaStr: string): Promise<number> {
    const { lunes, domingo } = getSemanaBounds(semanaStr);
    const q = query(
      this.colRef(),
      where('alumnoUid', '==', alumnoUid),
      where('fechaStr', '>=', lunes),
      where('fechaStr', '<=', domingo),
      where('estado', '==', 'CANCELADA')
    );
    const snap = await getDocs(q);
    return snap.size;
  }

  async getSlotsAlumno(alumnoUid: string, fechaStr: string): Promise<Set<string>> {
    const map = await this.getSlotsAlumnoConInstructor(alumnoUid, fechaStr);
    return new Set(map.keys());
  }

  /**
   * Devuelve un Map slotKey → instructorUid para las clases activas del alumno en un día.
   * Permite mostrar en el calendario con qué instructor está agendado cada slot propio.
   */
  async getSlotsAlumnoConInstructor(alumnoUid: string, fechaStr: string): Promise<Map<string, string>> {
    const q = query(
      this.colRef(),
      where('alumnoUid', '==', alumnoUid),
      where('fechaStr', '==', fechaStr),
      where('estado', 'in', ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'])
    );
    const snap = await getDocs(q);
    const map = new Map<string, string>();
    snap.docs.forEach(d => {
      const t = d.data() as Turno;
      t.slots?.forEach(s => map.set(s, t.instructorUid));
    });
    return map;
  }

  async getById(turnoId: string): Promise<Turno | null> {
    const snap = await getDoc(doc(this.firestore, 'turnos', turnoId));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Turno) : null;
  }

  /**
   * Instructor validó (QR o manual) → COMPLETADA + descuenta saldo + suma clasesDictadas.
   */
  async completarClase(turnoId: string, metodo: MetodoVerificacion): Promise<void> {
    await runTransaction(this.firestore, async (tx) => {
      const turnoRef  = doc(this.firestore, 'turnos', turnoId);
      const turnoSnap = await tx.get(turnoRef);
      if (!turnoSnap.exists()) throw new Error('Turno no encontrado');
      const turno = turnoSnap.data() as Turno;
      if (turno.saldoDescontado === true) return;

      const alumnoRef = doc(this.firestore, 'users', turno.alumnoUid);
      const instrRef  = doc(this.firestore, 'users', turno.instructorUid);
      const [alumnoSnap, instrSnap] = await Promise.all([tx.get(alumnoRef), tx.get(instrRef)]);

      tx.update(turnoRef, { estado: 'COMPLETADA', asistenciaVerificada: true, metodoVerificacion: metodo, saldoDescontado: true, actualizadoEn: serverTimestamp() });

      if (alumnoSnap.exists()) {
        const ad = (alumnoSnap.data() as User).alumnoData;
        if (ad?.planContratado && turno.consumidoDe === 'plan') {
          tx.update(alumnoRef, { 'alumnoData.planContratado.clasesRestantes': increment(-1), 'alumnoData.planContratado.clasesTomadas': increment(1), 'alumnoData.ultimaClaseFecha': serverTimestamp() });
        } else if (ad?.creditoIndividual && turno.consumidoDe === 'credito_individual') {
          tx.update(alumnoRef, this.creditoIndividualPatch(ad, turno.duracionMinutos));
        }
      }
      if (instrSnap.exists()) {
        tx.update(instrRef, { 'instructorData.clasesDictadas': increment(1) });
      }
    });
  }

  /**
   * CONFIRMADA vencida sin validación → AUSENTE + descuenta saldo al alumno.
   * El instructor NO suma clasesDictadas (no la dictó).
   */
  private async marcarAusente(turnoId: string): Promise<void> {
    await runTransaction(this.firestore, async (tx) => {
      const turnoRef  = doc(this.firestore, 'turnos', turnoId);
      const turnoSnap = await tx.get(turnoRef);
      if (!turnoSnap.exists()) return;
      const turno = turnoSnap.data() as Turno;
      if (turno.saldoDescontado === true) return;

      const alumnoRef = doc(this.firestore, 'users', turno.alumnoUid);
      const alumnoSnap = await tx.get(alumnoRef);

      tx.update(turnoRef, { estado: 'AUSENTE', saldoDescontado: true, actualizadoEn: serverTimestamp() });

      if (alumnoSnap.exists()) {
        const ad = (alumnoSnap.data() as User).alumnoData;
        if (ad?.planContratado && turno.consumidoDe === 'plan') {
          tx.update(alumnoRef, { 'alumnoData.planContratado.clasesRestantes': increment(-1), 'alumnoData.planContratado.clasesTomadas': increment(1), 'alumnoData.ultimaClaseFecha': serverTimestamp() });
        } else if (ad?.creditoIndividual && turno.consumidoDe === 'credito_individual') {
          tx.update(alumnoRef, this.creditoIndividualPatch(ad, turno.duracionMinutos));
        }
      }
    });
  }

  /** Genera el patch para descontar 1 clase del crédito individual (siempre 40 min). */
  private creditoIndividualPatch(_ad: NonNullable<User['alumnoData']>, _duracionMinutos: number): Record<string, any> {
    return {
      'alumnoData.creditoIndividual.clasesDisponibles': increment(-1),
      'alumnoData.creditoIndividual.clasesTomadas': increment(1),
      'alumnoData.creditoIndividual.clases40min': increment(-1),
      'alumnoData.ultimaClaseFecha': serverTimestamp(),
    };
  }

  /** True si el horario de inicio ya pasó y la clase nunca fue confirmada */
  private inicioYaPaso(turno: Turno): boolean {
    const [h, m] = turno.horaInicio.split(':').map(Number);
    const [y, mo, d] = turno.fechaStr.split('-').map(Number);
    return Date.now() >= new Date(y, mo - 1, d, h, m).getTime();
  }

  private vencio(turno: Turno): boolean {
    const [h, m] = turno.horaFin.split(':').map(Number);
    const [y, mo, d] = turno.fechaStr.split('-').map(Number);
    return Date.now() > new Date(y, mo - 1, d, h, m).getTime() + 60 * 60 * 1000;
  }

  /**
   * Al cargar la app procesa:
   * - CONFIRMADA vencida + validada → COMPLETADA (completarClase)
   * - CONFIRMADA vencida + sin validar → AUSENTE (marcarAusente, no suma clasesDictadas)
   * - COMPLETADA con saldoDescontado=false → descuenta saldo (compat. datos viejos)
   * - PENDIENTE_CONFIRMACION vencida → CANCELADA sin cargo (instructor nunca confirmó)
   */
  async procesarClasesVencidas(sucursalId: string): Promise<void> {
    const [snapConf, snapComp, snapPend] = await Promise.all([
      getDocs(query(this.colRef(), where('sucursalId', '==', sucursalId), where('estado', '==', 'CONFIRMADA'))),
      getDocs(query(this.colRef(), where('sucursalId', '==', sucursalId), where('estado', '==', 'COMPLETADA'), where('saldoDescontado', '==', false))),
      getDocs(query(this.colRef(), where('sucursalId', '==', sucursalId), where('estado', '==', 'PENDIENTE_CONFIRMACION'))),
    ]);

    for (const d of snapConf.docs) {
      const t = { id: d.id, ...d.data() } as Turno;
      if (t.saldoDescontado === true || !this.vencio(t)) continue;
      if (t.asistenciaVerificada) {
        await this.completarClase(t.id!, t.metodoVerificacion ?? 'manual').catch(e => console.error(`[completarClase] ${t.id}:`, e));
      } else {
        await this.marcarAusente(t.id!).catch(e => console.error(`[marcarAusente] ${t.id}:`, e));
      }
    }

    for (const d of snapComp.docs) {
      const t = { id: d.id, ...d.data() } as Turno;
      await this.completarClase(t.id!, t.metodoVerificacion ?? 'manual').catch(e => console.error(`[completarClase compat] ${t.id}:`, e));
    }

    for (const d of snapPend.docs) {
      const t = { id: d.id, ...d.data() } as Turno;
      if (!this.inicioYaPaso(t)) continue;
      await this.cancelarTurno(t.id!, 'El instructor no confirmó la clase a tiempo.')
        .catch(e => console.error(`[cancelarPendiente] ${t.id}:`, e));
      const fechaLegible = new Date(t.fechaStr + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const devolucion = t.consumidoDe === 'plan' ? 'Tu clase fue devuelta al plan.' : 'Tu crédito fue reintegrado.';
      let alumnoNombre = t.alumnoNombre;
      if (!alumnoNombre) {
        const snap = await getDoc(doc(this.firestore, 'users', t.alumnoUid)).catch(() => null);
        alumnoNombre = snap?.exists() ? (snap.data() as User).nombre : t.alumnoUid;
      }
      await Promise.all([
        this.notificacionService.enviar(
          t.alumnoUid, 'rechazo_turno', 'Clase cancelada automáticamente',
          `Tu clase del ${fechaLegible} a las ${t.horaInicio} fue cancelada porque el instructor no la confirmó a tiempo. ${devolucion}`,
          t.id,
        ).catch(() => {}),
        this.notificacionService.enviar(
          t.instructorUid, 'rechazo_turno', 'Clase cancelada automáticamente',
          `La clase de ${alumnoNombre} del ${fechaLegible} a las ${t.horaInicio} fue cancelada por falta de confirmación.`,
          t.id,
        ).catch(() => {}),
      ]);
    }
  }
}

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

/**
 * Se dispara cuando un turno cambia de estado.
 * Gestiona el consumo de clases del alumno y notificaciones.
 */
export const onTurnoEstadoCambio = functions
  .region('southamerica-east1')
  .firestore.document('turnos/{turnoId}')
  .onWrite(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (!after) return; // Turno eliminado, ignorar

    const estadoAnterior = before?.estado;
    const estadoNuevo = after.estado;

    if (estadoAnterior === estadoNuevo) return; // Sin cambio de estado

    const { alumnoUid, instructorUid, consumidoDe, turnoId = context.params.turnoId } = after;

    // ── COMPLETADA: consumir clase del saldo del alumno ────────────────────────
    if (estadoNuevo === 'COMPLETADA' && estadoAnterior !== 'COMPLETADA') {
      await consumirClase(alumnoUid, consumidoDe);

      // Crear registro de feedback vacío para que el alumno pueda calificar
      const feedbackExistente = await db.collection('feedbacks')
        .where('turnoId', '==', turnoId)
        .get();

      if (feedbackExistente.empty) {
        await db.collection('feedbacks').add({
          turnoId,
          alumnoUid,
          instructorUid,
          sucursalId: after.sucursalId,
          fechaClase: after.fecha,
          creadoEn: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Notificar al alumno
      await crearNotificacion(alumnoUid, 'clase_completada', 'Clase completada',
        'Tu clase fue completada. Podés calificar al instructor ahora.');

      // Actualizar última clase del alumno
      await db.collection('users').doc(alumnoUid).update({
        'alumnoData.ultimaClaseFecha': admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // ── CONFIRMADA: notificar al alumno ────────────────────────────────────────
    if (estadoNuevo === 'CONFIRMADA' && estadoAnterior === 'PENDIENTE_CONFIRMACION') {
      await crearNotificacion(alumnoUid, 'confirmacion_turno', 'Clase confirmada',
        `Tu clase del ${after.fechaStr} a las ${after.horaInicio} fue confirmada.`);
    }

    // ── RECHAZADA: notificar al alumno ─────────────────────────────────────────
    if (estadoNuevo === 'RECHAZADA' && estadoAnterior === 'PENDIENTE_CONFIRMACION') {
      const motivo = after.motivoRechazo ?? 'Sin motivo especificado';
      await crearNotificacion(alumnoUid, 'rechazo_turno', 'Clase rechazada',
        `Tu solicitud del ${after.fechaStr} fue rechazada. Motivo: ${motivo}`);
    }

    // ── PENDIENTE_CONFIRMACION: notificar al instructor ────────────────────────
    if (estadoNuevo === 'PENDIENTE_CONFIRMACION' && !estadoAnterior) {
      await crearNotificacion(instructorUid, 'nueva_solicitud', 'Nueva solicitud de clase',
        `Tenés una nueva solicitud para el ${after.fechaStr} a las ${after.horaInicio}.`);
    }
  });

/**
 * Valida la disponibilidad de slots antes de crear un turno (callable).
 * Esto es una capa extra de seguridad sobre la transacción del cliente.
 */
export const validarDisponibilidadSlots = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado.');

    const { instructorUid, fechaStr, slots } = data;
    if (!instructorUid || !fechaStr || !slots?.length) {
      throw new functions.https.HttpsError('invalid-argument', 'Parámetros incompletos.');
    }

    const turnosRef = db.collection('turnos')
      .where('instructorUid', '==', instructorUid)
      .where('fechaStr', '==', fechaStr)
      .where('estado', 'in', ['PENDIENTE_CONFIRMACION', 'CONFIRMADA']);

    const snap = await turnosRef.get();
    const ocupados = new Set<string>();
    snap.docs.forEach(d => {
      const t = d.data();
      (t.slots as string[])?.forEach(s => ocupados.add(s));
    });

    const conflicto = (slots as string[]).some(s => ocupados.has(s));
    return { disponible: !conflicto };
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function consumirClase(alumnoUid: string, consumidoDe: string): Promise<void> {
  const userRef = db.collection('users').doc(alumnoUid);

  await db.runTransaction(async tx => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error('Usuario no encontrado');
    const user = snap.data()!;
    const alumnoData = user.alumnoData;

    if (consumidoDe === 'plan' && alumnoData.planContratado) {
      const restantes = alumnoData.planContratado.clasesRestantes - 1;
      if (restantes < 0) throw new Error('Sin clases disponibles en el plan');
      tx.update(userRef, {
        'alumnoData.planContratado.clasesRestantes': restantes,
        'alumnoData.planContratado.clasesTomadas': alumnoData.planContratado.clasesTomadas + 1,
      });
    } else if (consumidoDe === 'credito_individual' && alumnoData.creditoIndividual) {
      const disponibles = alumnoData.creditoIndividual.clasesDisponibles - 1;
      if (disponibles < 0) throw new Error('Sin crédito individual disponible');
      tx.update(userRef, {
        'alumnoData.creditoIndividual.clasesDisponibles': disponibles,
        'alumnoData.creditoIndividual.clasesTomadas': alumnoData.creditoIndividual.clasesTomadas + 1,
      });
    }
  });
}

async function crearNotificacion(
  userId: string,
  tipo: string,
  titulo: string,
  mensaje: string,
  turnoId?: string
): Promise<void> {
  await db.collection('notificaciones').add({
    userId,
    tipo,
    titulo,
    mensaje,
    leida: false,
    turnoId: turnoId ?? null,
    creadoEn: admin.firestore.FieldValue.serverTimestamp(),
  });
}

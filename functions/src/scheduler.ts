import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

/**
 * Bloquea automáticamente alumnos inactivos.
 * Corre todos los lunes a las 8:00 AM.
 * Un alumno se bloquea si no tomó clases en N semanas (configurable).
 */
export const bloquearAlumnosInactivos = functions
  .region('southamerica-east1')
  .pubsub.schedule('0 8 * * 1')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    // Obtener configuración global
    const configSnap = await db.collection('configuracion').doc('global').get();
    const config = configSnap.data();
    const semanasSinClaseMax = config?.limites?.semanasSinClaseParaBloqueo ?? 4;

    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - semanasSinClaseMax * 7);
    const fechaLimiteTs = admin.firestore.Timestamp.fromDate(fechaLimite);

    // Buscar alumnos activos que no tomaron clase desde la fecha límite
    const alumnosSnap = await db.collection('users')
      .where('rol', '==', 'alumno')
      .where('activo', '==', true)
      .where('alumnoData.bloqueado', '==', false)
      .get();

    let bloqueados = 0;

    for (const doc of alumnosSnap.docs) {
      const alumno = doc.data();
      const ultimaClase = alumno.alumnoData?.ultimaClaseFecha;

      // Si nunca tuvo clase o la última fue antes del límite
      if (!ultimaClase || ultimaClase < fechaLimiteTs) {
        const saldo = (alumno.alumnoData?.planContratado?.clasesRestantes ?? 0)
          + (alumno.alumnoData?.creditoIndividual?.clasesDisponibles ?? 0);

        // Solo bloquear si tiene saldo (si no tiene saldo, ya fue notificado)
        if (saldo > 0) {
          await doc.ref.update({
            'alumnoData.bloqueado': true,
            'alumnoData.bloqueadoDesde': admin.firestore.FieldValue.serverTimestamp(),
            'alumnoData.motivoBloqueo': `Inactividad: sin clases por más de ${semanasSinClaseMax} semanas.`,
          });

          // Notificar al alumno
          await db.collection('notificaciones').add({
            userId: doc.id,
            tipo: 'bloqueo_cuenta',
            titulo: 'Cuenta bloqueada por inactividad',
            mensaje: `Tu cuenta fue bloqueada por no tomar clases en ${semanasSinClaseMax} semanas. Contactá al administrador.`,
            leida: false,
            creadoEn: admin.firestore.FieldValue.serverTimestamp(),
          });

          bloqueados++;
        }
      }
    }

    functions.logger.info(`Alumnos bloqueados por inactividad: ${bloqueados}`);
  });

/**
 * Marca como AUSENTE los turnos CONFIRMADOS que pasaron sin marcar asistencia.
 * Corre cada hora.
 */
export const marcarTurnosAusentes = functions
  .region('southamerica-east1')
  .pubsub.schedule('0 * * * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    const ahora = new Date();
    const hace2horas = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
    const hace2horasTs = admin.firestore.Timestamp.fromDate(hace2horas);

    const turnosVencidos = await db.collection('turnos')
      .where('estado', '==', 'CONFIRMADA')
      .where('asistenciaVerificada', '==', false)
      .where('fecha', '<', hace2horasTs)
      .get();

    const batch = db.batch();
    turnosVencidos.docs.forEach(doc => {
      batch.update(doc.ref, {
        estado: 'AUSENTE',
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (!turnosVencidos.empty) {
      await batch.commit();
      functions.logger.info(`Turnos marcados como AUSENTE: ${turnosVencidos.size}`);
    }
  });

/**
 * Cancela automáticamente turnos PENDIENTE_CONFIRMACION sin respuesta tras 24hs.
 */
export const cancelarPendientesSinRespuesta = functions
  .region('southamerica-east1')
  .pubsub.schedule('0 7 * * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const ayerTs = admin.firestore.Timestamp.fromDate(ayer);

    const pendientes = await db.collection('turnos')
      .where('estado', '==', 'PENDIENTE_CONFIRMACION')
      .where('creadoEn', '<', ayerTs)
      .get();

    const batch = db.batch();
    pendientes.docs.forEach(doc => {
      batch.update(doc.ref, {
        estado: 'CANCELADA',
        motivoRechazo: 'Sin respuesta del instructor en 24 horas. Turno cancelado automáticamente.',
        actualizadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    if (!pendientes.empty) {
      await batch.commit();
      functions.logger.info(`Pendientes cancelados automáticamente: ${pendientes.size}`);
    }
  });

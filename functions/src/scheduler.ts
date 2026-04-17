import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

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
 * Completa las clases CONFIRMADAS cuyo horaFin + 1 hora ya pasó y descuenta
 * la clase del saldo del alumno. Corre cada hora.
 * - Si el instructor validó (asistenciaVerificada=true): metodo='manual'
 * - Si nadie validó: metodo='auto' (alumno pierde la clase de todas formas)
 */
export const completarClasesVencidas = functions
  .region('southamerica-east1')
  .pubsub.schedule('0 * * * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    const ahora = new Date();
    let procesados = 0;

    const vencio = (t: any) => {
      const [h, m] = (t['horaFin'] as string).split(':').map(Number);
      const [y, mo, d] = (t['fechaStr'] as string).split('-').map(Number);
      return ahora.getTime() > new Date(y, mo - 1, d, h, m).getTime() + 60 * 60 * 1000;
    };

    const descontarSaldo = async (tx: any, alumnoRef: any, alumnoSnap: any, turno: any) => {
      if (!alumnoSnap.exists) return;
      const ad = alumnoSnap.data()['alumnoData'];
      if (!ad) return;
      if (turno['consumidoDe'] === 'plan' && ad['planContratado']) {
        tx.update(alumnoRef, {
          'alumnoData.planContratado.clasesRestantes': Math.max(0, ad['planContratado']['clasesRestantes'] - 1),
          'alumnoData.planContratado.clasesTomadas': ad['planContratado']['clasesTomadas'] + 1,
          'alumnoData.ultimaClaseFecha': admin.firestore.FieldValue.serverTimestamp(),
        });
      } else if (turno['consumidoDe'] === 'credito_individual' && ad['creditoIndividual']) {
        const ci = ad['creditoIndividual'];
        const dur: number = turno['duracionMinutos'] ?? 0;
        const patch: Record<string, any> = {
          'alumnoData.creditoIndividual.clasesDisponibles': Math.max(0, ci['clasesDisponibles'] - 1),
          'alumnoData.creditoIndividual.clasesTomadas': ci['clasesTomadas'] + 1,
          'alumnoData.ultimaClaseFecha': admin.firestore.FieldValue.serverTimestamp(),
        };
        if (dur === 30) patch['alumnoData.creditoIndividual.clases30min'] = Math.max(0, (ci['clases30min'] ?? 0) - 1);
        else if (dur === 45) patch['alumnoData.creditoIndividual.clases45min'] = Math.max(0, (ci['clases45min'] ?? 0) - 1);
        else if (dur === 60) patch['alumnoData.creditoIndividual.clases60min'] = Math.max(0, (ci['clases60min'] ?? 0) - 1);
        tx.update(alumnoRef, patch);
      }
    };

    // 1. CONFIRMADA vencida
    const snapConf = await db.collection('turnos').where('estado', '==', 'CONFIRMADA').get();
    for (const d of snapConf.docs) {
      const t = d.data();
      if (t['saldoDescontado'] === true || !vencio(t)) continue;
      const validada = t['asistenciaVerificada'] === true;
      try {
        await db.runTransaction(async (tx) => {
          const turnoRef  = db.collection('turnos').doc(d.id);
          const alumnoRef = db.collection('users').doc(t['alumnoUid']);
          const instrRef  = db.collection('users').doc(t['instructorUid']);
          const [turnoSnap, alumnoSnap, instrSnap] = await Promise.all([tx.get(turnoRef), tx.get(alumnoRef), tx.get(instrRef)]);
          if (!turnoSnap.exists || (turnoSnap.data() as any)['saldoDescontado'] === true) return;

          if (validada) {
            // Instructor validó → COMPLETADA, suma clasesDictadas
            tx.update(turnoRef, { estado: 'COMPLETADA', asistenciaVerificada: true, metodoVerificacion: t['metodoVerificacion'] ?? 'manual', saldoDescontado: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
            await descontarSaldo(tx, alumnoRef, alumnoSnap, t);
            if (instrSnap?.exists) {
              const instrData = (instrSnap!.data() as any)['instructorData'];
              tx.update(instrRef, { 'instructorData.clasesDictadas': (instrData?.['clasesDictadas'] ?? 0) + 1 });
            }
          } else {
            // Nadie validó → AUSENTE, NO suma clasesDictadas
            tx.update(turnoRef, { estado: 'AUSENTE', saldoDescontado: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
            await descontarSaldo(tx, alumnoRef, alumnoSnap, t);
          }
        });
        procesados++;
      } catch (err) {
        functions.logger.error(`Error procesando turno ${d.id}:`, err);
      }
    }

    // 2. COMPLETADA sin saldo descontado (compat. datos viejos)
    const snapComp = await db.collection('turnos').where('estado', '==', 'COMPLETADA').where('saldoDescontado', '==', false).get();
    for (const d of snapComp.docs) {
      const t = d.data();
      try {
        await db.runTransaction(async (tx) => {
          const turnoRef  = db.collection('turnos').doc(d.id);
          const alumnoRef = db.collection('users').doc(t['alumnoUid']);
          const instrRef  = db.collection('users').doc(t['instructorUid']);
          const [turnoSnap, alumnoSnap, instrSnap] = await Promise.all([tx.get(turnoRef), tx.get(alumnoRef), tx.get(instrRef)]);
          if (!turnoSnap.exists || (turnoSnap.data() as any)['saldoDescontado'] === true) return;
          tx.update(turnoRef, { saldoDescontado: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
          await descontarSaldo(tx, alumnoRef, alumnoSnap, t);
          if (instrSnap?.exists) {
            const instrData = (instrSnap!.data() as any)['instructorData'];
            tx.update(instrRef, { 'instructorData.clasesDictadas': (instrData?.['clasesDictadas'] ?? 0) + 1 });
          }
        });
        procesados++;
      } catch (err) {
        functions.logger.error(`Error procesando completada ${d.id}:`, err);
      }
    }

    functions.logger.info(`Clases procesadas automáticamente: ${procesados}`);
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

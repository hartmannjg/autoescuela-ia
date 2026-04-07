import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

/**
 * Envía recordatorio 24hs antes de cada clase confirmada.
 * Triggerada por Cloud Scheduler cada día a las 9:00 AM.
 */
export const enviarRecordatorios24hs = functions
  .region('southamerica-east1')
  .pubsub.schedule('0 9 * * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const mananaStr = manana.toISOString().split('T')[0];

    const turnosManana = await db.collection('turnos')
      .where('fechaStr', '==', mananaStr)
      .where('estado', '==', 'CONFIRMADA')
      .get();

    const batch = db.batch();
    const notificaciones: any[] = [];

    turnosManana.docs.forEach(doc => {
      const turno = doc.data();
      notificaciones.push({
        userId: turno.alumnoUid,
        tipo: 'recordatorio_turno',
        titulo: 'Recordatorio: Clase mañana',
        mensaje: `Tenés clase mañana ${mananaStr} a las ${turno.horaInicio}. ¡No olvides tu QR!`,
        leida: false,
        turnoId: doc.id,
        creadoEn: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Insertar notificaciones en lotes
    for (let i = 0; i < notificaciones.length; i += 500) {
      const lote = notificaciones.slice(i, i + 500);
      const batchOp = db.batch();
      lote.forEach(n => batchOp.set(db.collection('notificaciones').doc(), n));
      await batchOp.commit();
    }

    functions.logger.info(`Recordatorios enviados: ${notificaciones.length}`);
  });

/**
 * Envía email transaccional cuando se crea una notificación.
 * Usa la extensión "Trigger Email" de Firebase apuntando a la colección "mail".
 */
export const onNotificacionCreada = functions
  .region('southamerica-east1')
  .firestore.document('notificaciones/{notifId}')
  .onCreate(async (snap) => {
    const notif = snap.data();
    if (!notif) return;

    // Solo enviamos email para tipos críticos
    const tiposConEmail = ['confirmacion_turno', 'rechazo_turno', 'bloqueo_cuenta'];
    if (!tiposConEmail.includes(notif.tipo)) return;

    const userSnap = await db.collection('users').doc(notif.userId).get();
    if (!userSnap.exists) return;

    const user = userSnap.data()!;

    // Escribe en la colección "mail" que procesa la extensión Trigger Email
    await db.collection('mail').add({
      to: user.email,
      template: {
        name: notif.tipo,
        data: {
          nombre: user.nombre,
          mensaje: notif.mensaje,
          titulo: notif.titulo,
        },
      },
    });
  });

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

const db = admin.firestore();

/**
 * Callable: Elimina un usuario (alumno o instructor) del sistema.
 * Borra el registro en Firebase Auth y en Firestore.
 * Los turnos existentes se conservan como historial.
 *
 * Solo puede ser llamado por un admin o super-admin.
 */
export const eliminarUsuario = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado.');
    }

    const { uid } = data as { uid: string };
    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'uid requerido.');
    }

    // Verificar que el caller es admin o super-admin
    const callerSnap = await db.collection('users').doc(context.auth.uid).get();
    const callerRol = callerSnap.data()?.rol as string | undefined;
    if (callerRol !== 'admin' && callerRol !== 'super-admin') {
      throw new functions.https.HttpsError('permission-denied', 'No tenés permisos para eliminar usuarios.');
    }

    // No permitir que se auto-elimine
    if (uid === context.auth.uid) {
      throw new functions.https.HttpsError('failed-precondition', 'No podés eliminar tu propia cuenta.');
    }

    // Eliminar de Firebase Auth
    await admin.auth().deleteUser(uid);

    // Eliminar documento de Firestore
    await db.collection('users').doc(uid).delete();

    return { success: true };
  });

/**
 * Se dispara cuando un instructor actualiza el valoracionPromedio.
 * Recalcula el promedio real de todos los feedbacks del instructor.
 */
export const recalcularValoracionInstructor = functions
  .region('southamerica-east1')
  .firestore.document('feedbacks/{feedbackId}')
  .onWrite(async (change, context) => {
    const feedback = change.after.data();
    if (!feedback?.alumnoFeedback?.puntuacion) return;

    const instructorUid = feedback.instructorUid;

    // Obtener todos los feedbacks del instructor con calificación del alumno
    const snap = await db.collection('feedbacks')
      .where('instructorUid', '==', instructorUid)
      .get();

    const puntuaciones = snap.docs
      .map(d => d.data().alumnoFeedback?.puntuacion)
      .filter((p): p is number => typeof p === 'number');

    if (puntuaciones.length === 0) return;

    const promedio = puntuaciones.reduce((a, b) => a + b, 0) / puntuaciones.length;

    await db.collection('users').doc(instructorUid).update({
      'instructorData.valoracionPromedio': Math.round(promedio * 10) / 10,
      'instructorData.clasesDictadas': puntuaciones.length,
    });
  });

/**
 * Callable: Comprar paquete de clases (simula el flujo de pago).
 * En producción, aquí iría la integración con MercadoPago/Stripe.
 */
export const comprarPaquete = functions
  .region('southamerica-east1')
  .https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado.');

    const { paqueteId, cantidadClases, precio } = data;
    const alumnoUid = context.auth.uid;

    if (!paqueteId || !cantidadClases || !precio) {
      throw new functions.https.HttpsError('invalid-argument', 'Parámetros incompletos.');
    }

    const userRef = db.collection('users').doc(alumnoUid);
    const snap = await userRef.get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Usuario no encontrado.');

    const user = snap.data()!;
    const credito = user.alumnoData?.creditoIndividual ?? { clasesDisponibles: 0, clasesTomadas: 0, paquetesComprados: [] };

    const nuevoPaquete = {
      id: `paq_${Date.now()}`,
      cantidadClases,
      precio,
      fechaCompra: admin.firestore.FieldValue.serverTimestamp(),
    };

    await userRef.update({
      'alumnoData.creditoIndividual': {
        ...credito,
        clasesDisponibles: credito.clasesDisponibles + cantidadClases,
        fechaUltimaCompra: admin.firestore.FieldValue.serverTimestamp(),
        paquetesComprados: [...(credito.paquetesComprados ?? []), nuevoPaquete],
      },
    });

    return { success: true, nuevasCantidad: credito.clasesDisponibles + cantidadClases };
  });

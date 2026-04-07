import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

const db = admin.firestore();

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

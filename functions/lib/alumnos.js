"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.comprarPaquete = exports.recalcularValoracionInstructor = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const db = admin.firestore();
/**
 * Se dispara cuando un instructor actualiza el valoracionPromedio.
 * Recalcula el promedio real de todos los feedbacks del instructor.
 */
exports.recalcularValoracionInstructor = functions
    .region('southamerica-east1')
    .firestore.document('feedbacks/{feedbackId}')
    .onWrite(async (change, context) => {
    var _a;
    const feedback = change.after.data();
    if (!((_a = feedback === null || feedback === void 0 ? void 0 : feedback.alumnoFeedback) === null || _a === void 0 ? void 0 : _a.puntuacion))
        return;
    const instructorUid = feedback.instructorUid;
    // Obtener todos los feedbacks del instructor con calificación del alumno
    const snap = await db.collection('feedbacks')
        .where('instructorUid', '==', instructorUid)
        .get();
    const puntuaciones = snap.docs
        .map(d => { var _a; return (_a = d.data().alumnoFeedback) === null || _a === void 0 ? void 0 : _a.puntuacion; })
        .filter((p) => typeof p === 'number');
    if (puntuaciones.length === 0)
        return;
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
exports.comprarPaquete = functions
    .region('southamerica-east1')
    .https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Debe estar autenticado.');
    const { paqueteId, cantidadClases, precio } = data;
    const alumnoUid = context.auth.uid;
    if (!paqueteId || !cantidadClases || !precio) {
        throw new functions.https.HttpsError('invalid-argument', 'Parámetros incompletos.');
    }
    const userRef = db.collection('users').doc(alumnoUid);
    const snap = await userRef.get();
    if (!snap.exists)
        throw new functions.https.HttpsError('not-found', 'Usuario no encontrado.');
    const user = snap.data();
    const credito = (_b = (_a = user.alumnoData) === null || _a === void 0 ? void 0 : _a.creditoIndividual) !== null && _b !== void 0 ? _b : { clasesDisponibles: 0, clasesTomadas: 0, paquetesComprados: [] };
    const nuevoPaquete = {
        id: `paq_${Date.now()}`,
        cantidadClases,
        precio,
        fechaCompra: admin.firestore.FieldValue.serverTimestamp(),
    };
    await userRef.update({
        'alumnoData.creditoIndividual': Object.assign(Object.assign({}, credito), { clasesDisponibles: credito.clasesDisponibles + cantidadClases, fechaUltimaCompra: admin.firestore.FieldValue.serverTimestamp(), paquetesComprados: [...((_c = credito.paquetesComprados) !== null && _c !== void 0 ? _c : []), nuevoPaquete] }),
    });
    return { success: true, nuevasCantidad: credito.clasesDisponibles + cantidadClases };
});
//# sourceMappingURL=alumnos.js.map
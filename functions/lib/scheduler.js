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
exports.cancelarPendientesSinRespuesta = exports.completarClasesVencidas = exports.bloquearAlumnosInactivos = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions/v1"));
const db = admin.firestore();
/**
 * Bloquea automáticamente alumnos inactivos.
 * Corre todos los lunes a las 8:00 AM.
 * Un alumno se bloquea si no tomó clases en N semanas (configurable).
 */
exports.bloquearAlumnosInactivos = functions
    .region('southamerica-east1')
    .pubsub.schedule('0 8 * * 1')
    .timeZone('America/Argentina/Buenos_Aires')
    .onRun(async () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    // Obtener configuración global
    const configSnap = await db.collection('configuracion').doc('global').get();
    const config = configSnap.data();
    const semanasSinClaseMax = (_b = (_a = config === null || config === void 0 ? void 0 : config.limites) === null || _a === void 0 ? void 0 : _a.semanasSinClaseParaBloqueo) !== null && _b !== void 0 ? _b : 4;
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
        const ultimaClase = (_c = alumno.alumnoData) === null || _c === void 0 ? void 0 : _c.ultimaClaseFecha;
        // Si nunca tuvo clase o la última fue antes del límite
        if (!ultimaClase || ultimaClase < fechaLimiteTs) {
            const saldo = ((_f = (_e = (_d = alumno.alumnoData) === null || _d === void 0 ? void 0 : _d.planContratado) === null || _e === void 0 ? void 0 : _e.clasesRestantes) !== null && _f !== void 0 ? _f : 0)
                + ((_j = (_h = (_g = alumno.alumnoData) === null || _g === void 0 ? void 0 : _g.creditoIndividual) === null || _h === void 0 ? void 0 : _h.clasesDisponibles) !== null && _j !== void 0 ? _j : 0);
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
exports.completarClasesVencidas = functions
    .region('southamerica-east1')
    .pubsub.schedule('0 * * * *')
    .timeZone('America/Argentina/Buenos_Aires')
    .onRun(async () => {
    const ahora = new Date();
    let procesados = 0;
    const vencio = (t) => {
        const [h, m] = t['horaFin'].split(':').map(Number);
        const [y, mo, d] = t['fechaStr'].split('-').map(Number);
        return ahora.getTime() > new Date(y, mo - 1, d, h, m).getTime() + 60 * 60 * 1000;
    };
    const descontarSaldo = async (tx, alumnoRef, alumnoSnap, turno) => {
        if (!alumnoSnap.exists)
            return;
        const ad = alumnoSnap.data()['alumnoData'];
        if (!ad)
            return;
        if (turno['consumidoDe'] === 'plan' && ad['planContratado']) {
            tx.update(alumnoRef, {
                'alumnoData.planContratado.clasesRestantes': Math.max(0, ad['planContratado']['clasesRestantes'] - 1),
                'alumnoData.planContratado.clasesTomadas': ad['planContratado']['clasesTomadas'] + 1,
                'alumnoData.ultimaClaseFecha': admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else if (turno['consumidoDe'] === 'credito_individual' && ad['creditoIndividual']) {
            tx.update(alumnoRef, {
                'alumnoData.creditoIndividual.clasesDisponibles': Math.max(0, ad['creditoIndividual']['clasesDisponibles'] - 1),
                'alumnoData.creditoIndividual.clasesTomadas': ad['creditoIndividual']['clasesTomadas'] + 1,
                'alumnoData.ultimaClaseFecha': admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    };
    // 1. CONFIRMADA vencida
    const snapConf = await db.collection('turnos').where('estado', '==', 'CONFIRMADA').get();
    for (const d of snapConf.docs) {
        const t = d.data();
        if (t['saldoDescontado'] === true || !vencio(t))
            continue;
        const validada = t['asistenciaVerificada'] === true;
        try {
            await db.runTransaction(async (tx) => {
                var _a, _b;
                const turnoRef = db.collection('turnos').doc(d.id);
                const alumnoRef = db.collection('users').doc(t['alumnoUid']);
                const instrRef = db.collection('users').doc(t['instructorUid']);
                const [turnoSnap, alumnoSnap, instrSnap] = await Promise.all([tx.get(turnoRef), tx.get(alumnoRef), tx.get(instrRef)]);
                if (!turnoSnap.exists || turnoSnap.data()['saldoDescontado'] === true)
                    return;
                if (validada) {
                    // Instructor validó → COMPLETADA, suma clasesDictadas
                    tx.update(turnoRef, { estado: 'COMPLETADA', asistenciaVerificada: true, metodoVerificacion: (_a = t['metodoVerificacion']) !== null && _a !== void 0 ? _a : 'manual', saldoDescontado: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
                    await descontarSaldo(tx, alumnoRef, alumnoSnap, t);
                    if (instrSnap === null || instrSnap === void 0 ? void 0 : instrSnap.exists) {
                        const instrData = instrSnap.data()['instructorData'];
                        tx.update(instrRef, { 'instructorData.clasesDictadas': ((_b = instrData === null || instrData === void 0 ? void 0 : instrData['clasesDictadas']) !== null && _b !== void 0 ? _b : 0) + 1 });
                    }
                }
                else {
                    // Nadie validó → AUSENTE, NO suma clasesDictadas
                    tx.update(turnoRef, { estado: 'AUSENTE', saldoDescontado: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
                    await descontarSaldo(tx, alumnoRef, alumnoSnap, t);
                }
            });
            procesados++;
        }
        catch (err) {
            functions.logger.error(`Error procesando turno ${d.id}:`, err);
        }
    }
    // 2. COMPLETADA sin saldo descontado (compat. datos viejos)
    const snapComp = await db.collection('turnos').where('estado', '==', 'COMPLETADA').where('saldoDescontado', '==', false).get();
    for (const d of snapComp.docs) {
        const t = d.data();
        try {
            await db.runTransaction(async (tx) => {
                var _a;
                const turnoRef = db.collection('turnos').doc(d.id);
                const alumnoRef = db.collection('users').doc(t['alumnoUid']);
                const instrRef = db.collection('users').doc(t['instructorUid']);
                const [turnoSnap, alumnoSnap, instrSnap] = await Promise.all([tx.get(turnoRef), tx.get(alumnoRef), tx.get(instrRef)]);
                if (!turnoSnap.exists || turnoSnap.data()['saldoDescontado'] === true)
                    return;
                tx.update(turnoRef, { saldoDescontado: true, actualizadoEn: admin.firestore.FieldValue.serverTimestamp() });
                await descontarSaldo(tx, alumnoRef, alumnoSnap, t);
                if (instrSnap === null || instrSnap === void 0 ? void 0 : instrSnap.exists) {
                    const instrData = instrSnap.data()['instructorData'];
                    tx.update(instrRef, { 'instructorData.clasesDictadas': ((_a = instrData === null || instrData === void 0 ? void 0 : instrData['clasesDictadas']) !== null && _a !== void 0 ? _a : 0) + 1 });
                }
            });
            procesados++;
        }
        catch (err) {
            functions.logger.error(`Error procesando completada ${d.id}:`, err);
        }
    }
    functions.logger.info(`Clases procesadas automáticamente: ${procesados}`);
});
/**
 * Cancela automáticamente turnos PENDIENTE_CONFIRMACION sin respuesta tras 24hs.
 */
exports.cancelarPendientesSinRespuesta = functions
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
//# sourceMappingURL=scheduler.js.map
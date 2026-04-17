import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';

admin.initializeApp();
const db = admin.firestore();

// ─── Re-exportamos todas las funciones ───────────────────────────────────────
export * from './turnos';
export * from './alumnos';
export * from './notificaciones';
export * from './scheduler';

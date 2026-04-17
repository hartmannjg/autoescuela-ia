import { Timestamp } from '@angular/fire/firestore';

/** Convierte Timestamp de Firestore a Date */
export function tsToDate(ts: Timestamp): Date {
  return ts.toDate();
}

/** Convierte Date a Timestamp de Firestore */
export function dateToTs(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

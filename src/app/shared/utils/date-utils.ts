import { Timestamp } from '@angular/fire/firestore';

/** Convierte Date a string "YYYY-MM-DD" */
export function dateToStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Convierte string "YYYY-MM-DD" a Date */
export function strToDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Convierte Timestamp de Firestore a Date */
export function tsToDate(ts: Timestamp): Date {
  return ts.toDate();
}

/** Convierte Date a Timestamp de Firestore */
export function dateToTs(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

/** Genera el key de un slot: "YYYY-MM-DD_HH:MM" */
export function slotKey(fechaStr: string, hora: string): string {
  return `${fechaStr}_${hora}`;
}

/** Genera todos los slots de 15 minutos para una clase */
export function generarSlots(fechaStr: string, horaInicio: string, duracionMinutos: number): string[] {
  const slots: string[] = [];
  const [hh, mm] = horaInicio.split(':').map(Number);
  let totalMinutos = hh * 60 + mm;
  const cantSlots = duracionMinutos / 15;

  for (let i = 0; i < cantSlots; i++) {
    const h = Math.floor(totalMinutos / 60);
    const m = totalMinutos % 60;
    slots.push(slotKey(fechaStr, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`));
    totalMinutos += 15;
  }
  return slots;
}

/** Calcula la hora de fin dado inicio y duración */
export function calcularHoraFin(horaInicio: string, duracionMinutos: number): string {
  const [hh, mm] = horaInicio.split(':').map(Number);
  const totalMinutos = hh * 60 + mm + duracionMinutos;
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Verifica si una fecha es hoy */
export function esHoy(fecha: Date): boolean {
  const hoy = new Date();
  return (
    fecha.getDate() === hoy.getDate() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getFullYear() === hoy.getFullYear()
  );
}

/** Retorna el inicio y fin de la semana actual */
export function semanaActual(): { inicio: Date; fin: Date } {
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0=Dom
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - diaSemana);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 6);
  fin.setHours(23, 59, 59, 999);
  return { inicio, fin };
}

/** Formatea hora "09:00" a "9:00 AM" */
export function formatHora12(hora24: string): string {
  const [h, m] = hora24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

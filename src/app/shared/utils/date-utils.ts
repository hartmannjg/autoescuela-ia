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

/** Genera el key de un slot: "YYYY-MM-DD_HH:MM" */
export function slotKey(fechaStr: string, hora: string): string {
  return `${fechaStr}_${hora}`;
}

/** Intervalo base de cada slot en minutos (1 slot = 40 min) */
export const SLOT_INTERVAL = 40;

/** Genera todos los slots de 40 minutos para una clase */
export function generarSlots(fechaStr: string, horaInicio: string, duracionMinutos: number): string[] {
  const slots: string[] = [];
  const [hh, mm] = horaInicio.split(':').map(Number);
  let totalMinutos = hh * 60 + mm;
  const cantSlots = duracionMinutos / SLOT_INTERVAL;

  for (let i = 0; i < cantSlots; i++) {
    const h = Math.floor(totalMinutos / 60);
    const m = totalMinutos % 60;
    slots.push(slotKey(fechaStr, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`));
    totalMinutos += SLOT_INTERVAL;
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

/**
 * Dado un string "YYYY-MM-DD" retorna el identificador de semana ISO:
 * "YYYY-Www" donde W es el número de semana (lunes como inicio).
 */
export function getSemanaStr(fechaStr: string): string {
  const [y, m, d] = fechaStr.split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  const day = (fecha.getDay() + 6) % 7; // 0=lun … 6=dom
  const lunes = new Date(fecha);
  lunes.setDate(fecha.getDate() - day);
  const startOfYear = new Date(lunes.getFullYear(), 0, 1);
  const week = Math.ceil(((lunes.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7);
  return `${lunes.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Dado un identificador "YYYY-Www" retorna { lunes, domingo } como strings "YYYY-MM-DD".
 * Inverso consistente de getSemanaStr.
 */
export function getSemanaBounds(semanaStr: string): { lunes: string; domingo: string } {
  const [yearStr, weekStr] = semanaStr.split('-W');
  const year = Number(yearStr);
  const week = Number(weekStr);
  // Candidato: Jan 1 + (week-1)*7 días. Puede no ser lunes.
  const jan1 = new Date(year, 0, 1);
  const candidate = new Date(jan1.getTime() + (week - 1) * 7 * 86400000);
  // Avanzar al próximo lunes (o quedarse si ya es lunes)
  const dayOfWeek = (candidate.getDay() + 6) % 7; // 0=lun…6=dom
  const daysToNextMonday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const lunes = new Date(candidate.getTime() + daysToNextMonday * 86400000);
  const domingo = new Date(lunes.getTime() + 6 * 86400000);
  return { lunes: dateToStr(lunes), domingo: dateToStr(domingo) };
}

/**
 * Calcula la fechaFin de un plan basándose en las clases totales y el mínimo
 * de clases por semana requerido, con 2 semanas de buffer.
 * Ej: 10 clases / 1 por semana = 10 semanas + 2 buffer = 12 semanas.
 */
export function calcularFechaFinPlan(clasesTotales: number, minClasesPorSemana: number): Date {
  const semanasNecesarias = Math.ceil(clasesTotales / minClasesPorSemana);
  const fin = new Date();
  fin.setDate(fin.getDate() + (semanasNecesarias + 2) * 7);
  return fin;
}

/** Formatea hora "09:00" a "9:00 AM" */
export function formatHora12(hora24: string): string {
  const [h, m] = hora24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

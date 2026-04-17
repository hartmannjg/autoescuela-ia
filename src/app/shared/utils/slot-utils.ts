import { generarSlots, slotKey, SLOT_INTERVAL } from './date-utils';

export interface SlotDisponible {
  horaInicio: string;
  horaFin: string;
  disponible: boolean;
  /** true = puede iniciar una clase aquí (hay tiempo suficiente hasta el cierre). */
  puedeIniciar: boolean;
  /** true = el alumno tiene una clase propia que ocupa este intervalo de 20 min. */
  esMiClase: boolean;
}

/**
 * Genera todos los slots del día.
 * - Verde   (disponible=true,  esMiClase=false): libre, clickeable
 * - Rojo    (disponible=false, esMiClase=false): ocupado por otro alumno
 * - Naranja (esMiClase=true):                   clase propia del alumno
 * - Azul    (seleccionado):                     rango actualmente elegido
 * Los slots "tail" (la clase excedería el cierre) se muestran verdes y muestran
 * un popup al hacer click, en lugar de mostrarse en gris.
 */
export function generarSlotsDia(
  fechaStr: string,
  apertura: string,
  cierre: string,
  duracionMinutos: number,
  slotsOcupados: Set<string>,
  slotsAlumno: Set<string> = new Set()
): SlotDisponible[] {
  const slots: SlotDisponible[] = [];
  const [hA, mA] = apertura.split(':').map(Number);
  const [hC, mC] = cierre.split(':').map(Number);
  let minActual = hA * 60 + mA;
  const minCierre = hC * 60 + mC;

  while (minActual < minCierre) {
    const horaInicio = `${String(Math.floor(minActual / 60)).padStart(2, '0')}:${String(minActual % 60).padStart(2, '0')}`;
    const minFin  = minActual + duracionMinutos;
    const horaFin = `${String(Math.floor(minFin / 60)).padStart(2, '0')}:${String(minFin % 60).padStart(2, '0')}`;

    // El slot es "mi clase" si este intervalo de 20 min está ocupado por el propio alumno
    const esMiClase   = slotsAlumno.has(slotKey(fechaStr, horaInicio));
    const puedeIniciar = minFin <= minCierre;

    let disponible: boolean;
    if (esMiClase) {
      disponible = false; // no se puede reservar encima de una clase propia
    } else if (puedeIniciar) {
      disponible = generarSlots(fechaStr, horaInicio, duracionMinutos).every(s => !slotsOcupados.has(s));
    } else {
      disponible = true; // slot tail: se muestra verde, popup al clickear
    }

    slots.push({ horaInicio, horaFin, disponible, puedeIniciar, esMiClase });
    minActual += SLOT_INTERVAL;
  }

  return slots;
}

/** Verifica si un conjunto de slots está completamente libre */
export function slotsLibres(slots: string[], ocupados: Set<string>): boolean {
  return slots.every(s => !ocupados.has(s));
}

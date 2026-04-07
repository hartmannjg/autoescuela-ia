import { generarSlots, slotKey } from './date-utils';

export interface SlotDisponible {
  horaInicio: string;
  horaFin: string;
  disponible: boolean;
}

/** Genera todos los slots del día para una sucursal */
export function generarSlotsDia(
  fechaStr: string,
  apertura: string,
  cierre: string,
  duracionMinutos: number,
  slotsOcupados: Set<string>
): SlotDisponible[] {
  const slots: SlotDisponible[] = [];
  const [hA, mA] = apertura.split(':').map(Number);
  const [hC, mC] = cierre.split(':').map(Number);
  let minActual = hA * 60 + mA;
  const minCierre = hC * 60 + mC;

  while (minActual + duracionMinutos <= minCierre) {
    const horaInicio = `${String(Math.floor(minActual / 60)).padStart(2, '0')}:${String(minActual % 60).padStart(2, '0')}`;
    const slotsClase = generarSlots(fechaStr, horaInicio, duracionMinutos);
    const disponible = slotsClase.every(s => !slotsOcupados.has(s));

    const minFin = minActual + duracionMinutos;
    const horaFin = `${String(Math.floor(minFin / 60)).padStart(2, '0')}:${String(minFin % 60).padStart(2, '0')}`;

    slots.push({ horaInicio, horaFin, disponible });
    minActual += 15; // avanza de a 15 min
  }

  return slots;
}

/** Verifica si un conjunto de slots está completamente libre */
export function slotsLibres(slots: string[], ocupados: Set<string>): boolean {
  return slots.every(s => !ocupados.has(s));
}

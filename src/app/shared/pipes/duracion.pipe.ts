import { Pipe, PipeTransform } from '@angular/core';

/** Muestra 40 como "40 min" y 80 como "1h 20min". */
@Pipe({ name: 'duracion', standalone: true })
export class DuracionPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return formatDuracion(value ?? 0);
  }
}

/** Función standalone para usar en strings de TypeScript (Swal, etc.) */
export function formatDuracion(min: number): string {
  if (min === 80) return '1h 20min';
  return `${min} min`;
}

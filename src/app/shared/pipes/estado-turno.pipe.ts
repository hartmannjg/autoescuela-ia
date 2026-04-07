import { Pipe, PipeTransform } from '@angular/core';
import { TurnoEstado } from '../models';

@Pipe({ name: 'estadoTurno', standalone: true })
export class EstadoTurnoPipe implements PipeTransform {
  private readonly labels: Record<TurnoEstado, string> = {
    PENDIENTE_CONFIRMACION: 'Pendiente',
    CONFIRMADA: 'Confirmada',
    RECHAZADA: 'Rechazada',
    REPROGRAMADA: 'Reprogramada',
    COMPLETADA: 'Completada',
    CANCELADA: 'Cancelada',
    AUSENTE: 'Ausente',
  };

  private readonly colors: Record<TurnoEstado, string> = {
    PENDIENTE_CONFIRMACION: 'warn',
    CONFIRMADA: 'accent',
    RECHAZADA: 'warn',
    REPROGRAMADA: 'primary',
    COMPLETADA: 'primary',
    CANCELADA: '',
    AUSENTE: 'warn',
  };

  transform(value: TurnoEstado, tipo: 'label' | 'color' = 'label'): string {
    if (tipo === 'color') return this.colors[value] ?? '';
    return this.labels[value] ?? value;
  }
}

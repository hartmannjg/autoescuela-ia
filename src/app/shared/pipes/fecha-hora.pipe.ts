import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';

@Pipe({ name: 'fechaHora', standalone: true })
export class FechaHoraPipe implements PipeTransform {
  transform(value: Timestamp | Date | string | null | undefined, formato: 'fecha' | 'hora' | 'fechaHora' | 'relativo' | 'conDia' = 'fechaHora'): string {
    if (!value) return '';

    let date: Date;
    if (value instanceof Timestamp) {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // Parse YYYY-MM-DD in local timezone to avoid UTC offset shifting the day
      const [y, m, d] = value.split('-').map(Number);
      date = new Date(y, m - 1, d);
    } else {
      date = new Date(value);
    }

    if (isNaN(date.getTime())) return '';

    switch (formato) {
      case 'fecha':
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      case 'hora':
        return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      case 'fechaHora':
        return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      case 'relativo':
        return this.relativo(date);
      case 'conDia': {
        const dia = date.toLocaleDateString('es-AR', { weekday: 'long' });
        const fecha = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return `${dia.charAt(0).toUpperCase() + dia.slice(1)}, ${fecha}`;
      }
      default:
        return date.toLocaleString('es-AR');
    }
  }

  private relativo(date: Date): string {
    const ahora = new Date();
    const diff = ahora.getTime() - date.getTime();
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(minutos / 60);
    const dias = Math.floor(horas / 24);

    if (minutos < 1) return 'Hace un momento';
    if (minutos < 60) return `Hace ${minutos} min`;
    if (horas < 24) return `Hace ${horas}h`;
    if (dias === 1) return 'Ayer';
    if (dias < 7) return `Hace ${dias} días`;
    return date.toLocaleDateString('es-AR');
  }
}

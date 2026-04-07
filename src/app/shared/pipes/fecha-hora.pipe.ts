import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';

@Pipe({ name: 'fechaHora', standalone: true })
export class FechaHoraPipe implements PipeTransform {
  transform(value: Timestamp | Date | string | null | undefined, formato: 'fecha' | 'hora' | 'fechaHora' | 'relativo' = 'fechaHora'): string {
    if (!value) return '';

    let date: Date;
    if (value instanceof Timestamp) {
      date = value.toDate();
    } else if (value instanceof Date) {
      date = value;
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

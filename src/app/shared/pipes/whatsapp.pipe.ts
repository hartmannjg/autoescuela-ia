import { Pipe, PipeTransform } from '@angular/core';

/** Convierte un número de teléfono a URL de WhatsApp (wa.me).
 *  Elimina caracteres no numéricos y agrega el prefijo de país 54 (Argentina) si falta.
 *  Para que funcione correctamente con celulares argentinos, guardar el número con el
 *  prefijo 549 (ej: 5491123456789).
 */
@Pipe({ name: 'whatsapp', standalone: true })
export class WhatsappPipe implements PipeTransform {
  transform(telefono: string | null | undefined): string {
    if (!telefono) return '';
    const digits = telefono.replace(/\D/g, '');
    let number: string;
    if (digits.startsWith('54')) {
      number = digits;
    } else if (digits.startsWith('0')) {
      number = '54' + digits.slice(1);
    } else {
      number = '54' + digits;
    }
    return `https://wa.me/${number}`;
  }
}

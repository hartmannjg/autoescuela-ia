import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'moneda', standalone: true })
export class MonedaPipe implements PipeTransform {
  transform(value: number | null | undefined, simbolo = '$'): string {
    if (value == null) return `${simbolo}0`;
    return `${simbolo}${value.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
  }
}

import { Directive, ElementRef, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Directiva para inputs de precios: almacena un número en el form model
 * y muestra el valor formateado con separador de miles (ej: 250.000).
 *
 * Uso: <input appMonedaInput type="text" formControlName="precio" />
 */
@Directive({
  selector: 'input[appMonedaInput]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MonedaInputDirective),
      multi: true,
    },
  ],
  host: {
    '(input)': 'onInputChange($event)',
    '(blur)': 'onTouched()',
  },
})
export class MonedaInputDirective implements ControlValueAccessor {
  private el = inject(ElementRef<HTMLInputElement>);

  onChange: (val: number | null) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.el.nativeElement.value =
      value != null && !isNaN(value)
        ? Number(value).toLocaleString('es-AR', { maximumFractionDigits: 0 })
        : '';
  }

  registerOnChange(fn: (val: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.el.nativeElement.disabled = isDisabled;
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '');
    const num = raw === '' ? null : Number(raw);
    input.value = num != null ? num.toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '';
    this.onChange(num);
  }
}

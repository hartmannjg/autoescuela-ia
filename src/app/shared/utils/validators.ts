import { AbstractControl, ValidationErrors } from '@angular/forms';

export function telefonoArgentinoValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const regex = /^(\+54|0054|54)?[\s-]?(9)?[\s-]?(\d{2,4})[\s-]?(\d{6,8})$/;
  return regex.test(control.value) ? null : { telefonoInvalido: true };
}

export function horaValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(control.value) ? null : { horaInvalida: true };
}

export function fechaFuturaValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const fecha = new Date(control.value);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return fecha >= hoy ? null : { fechaPasada: true };
}

export function passwordForteValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const tieneMinusculas = /[a-z]/.test(control.value);
  const tieneMayusculas = /[A-Z]/.test(control.value);
  const tieneNumeros = /\d/.test(control.value);
  const longitudMinima = control.value.length >= 8;

  if (!tieneMinusculas || !tieneMayusculas || !tieneNumeros || !longitudMinima) {
    return { passwordDebil: true };
  }
  return null;
}

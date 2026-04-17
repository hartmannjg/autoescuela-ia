import { describe, it, expect } from 'vitest';
import { QrInstructorPayload } from './qr.service';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de validación de payload QR (lógica pura, sin Firestore)
// Replica la misma validación que hace validarYMarcarQrInstructor
// ─────────────────────────────────────────────────────────────────────────────

function parsearPayloadQr(raw: string): { valido: false; motivo: string } | { valido: true; payload: QrInstructorPayload } {
  let payload: QrInstructorPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { valido: false, motivo: 'QR inválido o corrupto.' };
  }
  if (payload.type !== 'class-qr' || !payload.turnoId) {
    return { valido: false, motivo: 'QR con formato incorrecto.' };
  }
  return { valido: true, payload };
}

function estaEnVentanaValidacion(
  fechaStr: string,
  horaInicio: string,
  horaFin: string,
  ahora: Date
): { valido: boolean; motivo?: string } {
  const [y, mo, d] = fechaStr.split('-').map(Number);
  const [hI, mI] = horaInicio.split(':').map(Number);
  const [hF, mF] = horaFin.split(':').map(Number);

  const inicioClase = new Date(y, mo - 1, d, hI, mI);
  const finClase    = new Date(y, mo - 1, d, hF, mF);
  const desde       = new Date(inicioClase.getTime() - 30 * 60 * 1000);
  const hasta       = new Date(finClase.getTime()    + 60 * 60 * 1000);

  if (ahora < desde) return { valido: false, motivo: 'El QR solo es válido a partir de 30 minutos antes del inicio.' };
  if (ahora > hasta) return { valido: false, motivo: 'El tiempo para validar esta clase ya expiró (1 hora después del fin).' };
  return { valido: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// parsearPayloadQr
// ─────────────────────────────────────────────────────────────────────────────
describe('parsearPayloadQr', () => {
  it('acepta un payload válido', () => {
    const raw = JSON.stringify({ type: 'class-qr', turnoId: 'abc123' });
    const result = parsearPayloadQr(raw);
    expect(result.valido).toBe(true);
    if (result.valido) {
      expect(result.payload.turnoId).toBe('abc123');
      expect(result.payload.type).toBe('class-qr');
    }
  });

  it('rechaza JSON malformado', () => {
    const result = parsearPayloadQr('no-es-json{{{');
    expect(result.valido).toBe(false);
    if (!result.valido) expect(result.motivo).toContain('inválido');
  });

  it('rechaza payload con type incorrecto', () => {
    const raw = JSON.stringify({ type: 'otro-tipo', turnoId: 'abc' });
    const result = parsearPayloadQr(raw);
    expect(result.valido).toBe(false);
    if (!result.valido) expect(result.motivo).toContain('formato');
  });

  it('rechaza payload sin turnoId', () => {
    const raw = JSON.stringify({ type: 'class-qr' });
    const result = parsearPayloadQr(raw);
    expect(result.valido).toBe(false);
  });

  it('rechaza turnoId vacío', () => {
    const raw = JSON.stringify({ type: 'class-qr', turnoId: '' });
    const result = parsearPayloadQr(raw);
    expect(result.valido).toBe(false);
  });

  it('rechaza string vacío', () => {
    const result = parsearPayloadQr('');
    expect(result.valido).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// estaEnVentanaValidacion
// ─────────────────────────────────────────────────────────────────────────────
describe('estaEnVentanaValidacion', () => {
  const fecha = '2026-04-10';
  const inicio = '10:00';
  const fin = '11:00';

  it('acepta exactamente 30 min antes del inicio', () => {
    const ahora = new Date(2026, 3, 10, 9, 30);
    expect(estaEnVentanaValidacion(fecha, inicio, fin, ahora).valido).toBe(true);
  });

  it('acepta durante la clase', () => {
    const ahora = new Date(2026, 3, 10, 10, 30);
    expect(estaEnVentanaValidacion(fecha, inicio, fin, ahora).valido).toBe(true);
  });

  it('acepta exactamente 1 hora después del fin', () => {
    const ahora = new Date(2026, 3, 10, 12, 0);
    expect(estaEnVentanaValidacion(fecha, inicio, fin, ahora).valido).toBe(true);
  });

  it('rechaza más de 1 hora después del fin', () => {
    const ahora = new Date(2026, 3, 10, 12, 1);
    const result = estaEnVentanaValidacion(fecha, inicio, fin, ahora);
    expect(result.valido).toBe(false);
    expect(result.motivo).toContain('expiró');
  });

  it('rechaza antes de los 30 min previos al inicio', () => {
    const ahora = new Date(2026, 3, 10, 9, 29);
    const result = estaEnVentanaValidacion(fecha, inicio, fin, ahora);
    expect(result.valido).toBe(false);
    expect(result.motivo).toContain('30 minutos');
  });

  it('rechaza el día anterior', () => {
    const ahora = new Date(2026, 3, 9, 23, 59);
    expect(estaEnVentanaValidacion(fecha, inicio, fin, ahora).valido).toBe(false);
  });

  it('rechaza el día siguiente', () => {
    const ahora = new Date(2026, 3, 11, 0, 0);
    expect(estaEnVentanaValidacion(fecha, inicio, fin, ahora).valido).toBe(false);
  });
});

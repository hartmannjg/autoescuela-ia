import { describe, it, expect } from 'vitest';
import {
  dateToStr,
  strToDate,
  calcularHoraFin,
  generarSlots,
  slotKey,
  formatHora12,
  esHoy,
  semanaActual,
  getSemanaStr,
  getSemanaBounds,
} from './date-utils';

// ─────────────────────────────────────────────────────────────────────────────
// dateToStr
// ─────────────────────────────────────────────────────────────────────────────
describe('dateToStr', () => {
  it('formatea fecha normal a YYYY-MM-DD', () => {
    expect(dateToStr(new Date(2026, 3, 9))).toBe('2026-04-09');
  });

  it('rellena mes y día con cero a la izquierda', () => {
    expect(dateToStr(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('funciona correctamente para diciembre', () => {
    expect(dateToStr(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('maneja fin de mes correctamente', () => {
    expect(dateToStr(new Date(2026, 1, 28))).toBe('2026-02-28');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// strToDate
// ─────────────────────────────────────────────────────────────────────────────
describe('strToDate', () => {
  it('convierte "YYYY-MM-DD" a Date correctamente', () => {
    const d = strToDate('2026-04-09');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // Abril = 3
    expect(d.getDate()).toBe(9);
  });

  it('es inverso a dateToStr', () => {
    const original = new Date(2026, 3, 9);
    const str = dateToStr(original);
    const recovered = strToDate(str);
    expect(recovered.getFullYear()).toBe(original.getFullYear());
    expect(recovered.getMonth()).toBe(original.getMonth());
    expect(recovered.getDate()).toBe(original.getDate());
  });

  it('parsea primer día del año', () => {
    const d = strToDate('2026-01-01');
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcularHoraFin
// ─────────────────────────────────────────────────────────────────────────────
describe('calcularHoraFin', () => {
  it('suma 20 minutos correctamente', () => {
    expect(calcularHoraFin('09:00', 20)).toBe('09:20');
  });

  it('suma 40 minutos cruzando la hora', () => {
    expect(calcularHoraFin('09:40', 40)).toBe('10:20');
  });

  it('suma 60 minutos', () => {
    expect(calcularHoraFin('08:00', 60)).toBe('09:00');
  });

  it('maneja medianoche (cruce de hora)', () => {
    expect(calcularHoraFin('23:40', 20)).toBe('24:00');
  });

  it('rellena con cero a la izquierda', () => {
    expect(calcularHoraFin('08:00', 40)).toBe('08:40');
  });

  it('maneja minutos no redondos en inicio', () => {
    expect(calcularHoraFin('10:20', 40)).toBe('11:00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// slotKey
// ─────────────────────────────────────────────────────────────────────────────
describe('slotKey', () => {
  it('genera clave con formato correcto', () => {
    expect(slotKey('2026-04-09', '09:00')).toBe('2026-04-09_09:00');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generarSlots
// ─────────────────────────────────────────────────────────────────────────────
describe('generarSlots', () => {
  it('genera 1 slot para una clase de 20 min', () => {
    const slots = generarSlots('2026-04-09', '09:00', 20);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toBe('2026-04-09_09:00');
  });

  it('genera 2 slots para una clase de 40 min', () => {
    const slots = generarSlots('2026-04-09', '09:00', 40);
    expect(slots).toHaveLength(2);
    expect(slots[0]).toBe('2026-04-09_09:00');
    expect(slots[1]).toBe('2026-04-09_09:20');
  });

  it('genera 3 slots para una clase de 60 min', () => {
    const slots = generarSlots('2026-04-09', '09:00', 60);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toBe('2026-04-09_09:00');
    expect(slots[1]).toBe('2026-04-09_09:20');
    expect(slots[2]).toBe('2026-04-09_09:40');
  });

  it('maneja inicio en hora no redonda', () => {
    const slots = generarSlots('2026-04-09', '10:20', 40);
    expect(slots[0]).toBe('2026-04-09_10:20');
    expect(slots[1]).toBe('2026-04-09_10:40');
  });

  it('dos clases de 20min consecutivas no comparten slots', () => {
    const slots1 = new Set(generarSlots('2026-04-09', '09:00', 20));
    const slots2 = new Set(generarSlots('2026-04-09', '09:20', 20));
    const interseccion = [...slots1].filter(s => slots2.has(s));
    expect(interseccion).toHaveLength(0);
  });

  it('clases superpuestas sí comparten slots', () => {
    const slots1 = new Set(generarSlots('2026-04-09', '09:00', 60));
    const slots2 = new Set(generarSlots('2026-04-09', '09:20', 20));
    const interseccion = [...slots1].filter(s => slots2.has(s));
    expect(interseccion.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatHora12
// ─────────────────────────────────────────────────────────────────────────────
describe('formatHora12', () => {
  it('convierte hora de mañana a AM', () => {
    expect(formatHora12('09:00')).toBe('9:00 AM');
  });

  it('convierte mediodía a PM', () => {
    expect(formatHora12('12:00')).toBe('12:00 PM');
  });

  it('convierte hora de tarde a PM', () => {
    expect(formatHora12('15:30')).toBe('3:30 PM');
  });

  it('convierte medianoche a AM (00:00 → 12:00 AM)', () => {
    expect(formatHora12('00:00')).toBe('12:00 AM');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// esHoy
// ─────────────────────────────────────────────────────────────────────────────
describe('esHoy', () => {
  it('retorna true para la fecha actual', () => {
    expect(esHoy(new Date())).toBe(true);
  });

  it('retorna false para ayer', () => {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    expect(esHoy(ayer)).toBe(false);
  });

  it('retorna false para mañana', () => {
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    expect(esHoy(mañana)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// semanaActual
// ─────────────────────────────────────────────────────────────────────────────
describe('semanaActual', () => {
  it('inicio es anterior o igual a hoy', () => {
    const { inicio } = semanaActual();
    expect(inicio.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('fin es posterior o igual a hoy', () => {
    const { fin } = semanaActual();
    expect(fin.getTime()).toBeGreaterThanOrEqual(Date.now());
  });

  it('inicio y fin abarcan 6 días completos (domingo a sábado)', () => {
    const { inicio, fin } = semanaActual();
    const diffDias = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24);
    // fin tiene 23:59:59.999, por eso el diff es 6.999... días
    expect(Math.floor(diffDias)).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSemanaStr
// ─────────────────────────────────────────────────────────────────────────────
describe('getSemanaStr', () => {
  it('retorna formato YYYY-Www', () => {
    const result = getSemanaStr('2026-04-09');
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('lunes y domingo de la misma semana dan el mismo resultado', () => {
    // 2026-04-06 = lunes, 2026-04-12 = domingo
    expect(getSemanaStr('2026-04-06')).toBe(getSemanaStr('2026-04-12'));
  });

  it('lunes y el martes siguiente pertenecen a semanas distintas', () => {
    // 2026-04-12 = domingo, 2026-04-13 = lunes siguiente
    expect(getSemanaStr('2026-04-12')).not.toBe(getSemanaStr('2026-04-13'));
  });

  it('primer lunes del año tiene semana >= 1', () => {
    const result = getSemanaStr('2026-01-05'); // 5 ene 2026 = lunes
    const week = Number(result.split('-W')[1]);
    expect(week).toBeGreaterThanOrEqual(1);
  });

  it('días consecutivos en semanas distintas dan resultados distintos', () => {
    const s1 = getSemanaStr('2026-04-05'); // domingo
    const s2 = getSemanaStr('2026-04-06'); // lunes
    expect(s1).not.toBe(s2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSemanaBounds
// ─────────────────────────────────────────────────────────────────────────────
describe('getSemanaBounds', () => {
  it('es inverso a getSemanaStr: lunes y domingo pertenecen a la misma semana', () => {
    const semana = getSemanaStr('2026-04-09');
    const { lunes, domingo } = getSemanaBounds(semana);
    expect(getSemanaStr(lunes)).toBe(semana);
    expect(getSemanaStr(domingo)).toBe(semana);
  });

  it('lunes es anterior al domingo', () => {
    const { lunes, domingo } = getSemanaBounds('2026-W15');
    expect(lunes < domingo).toBe(true);
  });

  it('diferencia entre lunes y domingo es exactamente 6 días', () => {
    const { lunes, domingo } = getSemanaBounds('2026-W15');
    const [ly, lm, ld] = lunes.split('-').map(Number);
    const [dy, dm, dd] = domingo.split('-').map(Number);
    const diffMs = new Date(dy, dm - 1, dd).getTime() - new Date(ly, lm - 1, ld).getTime();
    expect(diffMs / (1000 * 60 * 60 * 24)).toBe(6);
  });

  it('retorna strings en formato YYYY-MM-DD', () => {
    const { lunes, domingo } = getSemanaBounds('2026-W15');
    expect(lunes).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(domingo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import {
  addMonthsSantiago,
  santiagoDateParts,
  santiagoMidnightUtc,
  startOfMonthSantiago,
  startOfTodaySantiago,
  startOfTomorrowSantiago,
} from '@/lib/chile/timezone';

/**
 * `src/lib/chile/timezone.ts` reemplaza los límites de "hoy"/"este mes" que
 * el dashboard calculaba con `Date.UTC(...)` (o con la hora local del
 * proceso). El caso que demuestra el bug original: un instante que en UTC ya
 * es 1 de septiembre, pero en Santiago (que va detrás de UTC) todavía es 31
 * de agosto — bucketearlo por UTC lo metía en el mes equivocado.
 */
describe('chile/timezone', () => {
  it('resuelve el día calendario en Santiago, no en UTC', () => {
    // 02:00 UTC del 1 de septiembre = 22:00 del 31 de agosto en Santiago (UTC-4 en esa fecha).
    expect(santiagoDateParts(new Date('2026-09-01T02:00:00Z'))).toEqual({ year: 2026, month: 8, day: 31 });
    // 12:00 UTC del mismo día sí cae ya en septiembre en Santiago.
    expect(santiagoDateParts(new Date('2026-09-01T12:00:00Z'))).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it('resuelve la medianoche de Santiago al instante UTC correcto en distintas épocas del año (DST)', () => {
    // Verano chileno (GMT-3): medianoche Santiago = 03:00 UTC.
    expect(santiagoMidnightUtc(2026, 1, 15).toISOString()).toBe('2026-01-15T03:00:00.000Z');
    // Invierno chileno (GMT-4): medianoche Santiago = 04:00 UTC.
    expect(santiagoMidnightUtc(2026, 9, 1).toISOString()).toBe('2026-09-01T04:00:00.000Z');
  });

  it('startOfMonthSantiago cae en el mes correcto aunque el instante ya haya rotado a otro mes en UTC', () => {
    // 2026-09-01T02:00:00Z todavía es agosto en Santiago (ver test de arriba):
    // el inicio de "su" mes debe ser el 1 de agosto, no el 1 de septiembre.
    const start = startOfMonthSantiago(new Date('2026-09-01T02:00:00Z'));
    expect(santiagoDateParts(start)).toEqual({ year: 2026, month: 8, day: 1 });
  });

  it('addMonthsSantiago suma/resta meses en el calendario de Santiago, cruzando años', () => {
    const base = new Date('2026-01-15T12:00:00Z'); // 15 de enero en Santiago.
    expect(santiagoDateParts(addMonthsSantiago(base, 1))).toEqual({ year: 2026, month: 2, day: 1 });
    expect(santiagoDateParts(addMonthsSantiago(base, -1))).toEqual({ year: 2025, month: 12, day: 1 });
    expect(santiagoDateParts(addMonthsSantiago(base, -11))).toEqual({ year: 2025, month: 2, day: 1 });
  });

  it('startOfTodaySantiago/startOfTomorrowSantiago delimitan exactamente 24h de calendario chileno', () => {
    const now = new Date('2026-09-01T02:00:00Z'); // 31 de agosto en Santiago.
    const start = startOfTodaySantiago(now);
    const end = startOfTomorrowSantiago(now);
    expect(santiagoDateParts(start)).toEqual({ year: 2026, month: 8, day: 31 });
    expect(santiagoDateParts(end)).toEqual({ year: 2026, month: 9, day: 1 });
    expect(start.getTime()).toBeLessThan(now.getTime());
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });
});

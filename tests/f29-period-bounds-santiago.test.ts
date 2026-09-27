import { periodBounds } from '@/lib/chile/f29';
import { santiagoDateParts } from '@/lib/chile/timezone';

/**
 * Auditoría 2026-09-27, hallazgo FIN-01/TRI-03: `periodBounds` delimitaba el
 * mes con `Date.UTC(year, month - 1, 1)`. Un documento emitido el 1 de marzo
 * a primera hora en Chile (`2026-03-01T02:00:00Z`, todavía 28/29 de febrero
 * en UTC-3) no calzaba con ese límite en UTC y el F29 de marzo lo perdía.
 */
describe('periodBounds — límites del período F29 en el calendario de Santiago', () => {
  it('el límite inferior es exactamente la medianoche de Santiago del día 1, no la de UTC', () => {
    const { from } = periodBounds(2026, 3);
    expect(santiagoDateParts(from)).toEqual({ year: 2026, month: 3, day: 1 });
    // Invierno chileno (GMT-3): medianoche Santiago del 1 de marzo = 03:00 UTC, no 00:00 UTC.
    expect(from.toISOString()).toBe('2026-03-01T03:00:00.000Z');
  });

  it('un documento de las 23:00 del 28 de febrero en Chile (ya "1 de marzo" en UTC) NO cae en el período de marzo', () => {
    // 2026-03-01T02:00:00Z en Santiago (GMT-3 en marzo) son las 23:00 del 28
    // de febrero: con el límite viejo (medianoche UTC) caía igual dentro de
    // marzo por error, duplicando/perdiendo débito fiscal entre los dos meses.
    const issuedAt = new Date('2026-03-01T02:00:00Z');
    expect(santiagoDateParts(issuedAt)).toEqual({ year: 2026, month: 2, day: 28 });

    const march = periodBounds(2026, 3);
    expect(issuedAt.getTime()).toBeLessThan(march.from.getTime());

    const february = periodBounds(2026, 2);
    expect(issuedAt.getTime()).toBeGreaterThanOrEqual(february.from.getTime());
    expect(issuedAt.getTime()).toBeLessThan(february.to.getTime());
  });

  it('el límite superior es la medianoche de Santiago del mes siguiente, cruzando de diciembre a enero', () => {
    const { to } = periodBounds(2026, 12);
    expect(santiagoDateParts(to)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('rechaza un mes fuera de rango', () => {
    expect(() => periodBounds(2026, 0)).toThrow(/inválido/);
    expect(() => periodBounds(2026, 13)).toThrow(/inválido/);
  });
});

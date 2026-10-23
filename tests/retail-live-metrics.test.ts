import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  SALE_REVERSAL_LIKE,
  clockLabel,
  computeLiveMetrics,
  dayTimeLabel,
  liveWindow,
  parseLowCoverage,
  parsePeriod,
  summarizeLive,
  type DayAggregate,
} from '@/lib/retail/live-metrics';

/**
 * "Retail en vivo": lo que el panel afirma de cada producto (cuánto se vendió
 * de lo disponible y para cuántos días alcanza) sale de estas funciones. Lo
 * que más fácil se rompe: contar como "sin demanda" los días en que el
 * producto estaba agotado, o inventar días restantes sin ventas.
 */

const TODAY = { year: 2026, month: 10, day: 23 };
const window7 = liveWindow(TODAY, 7);

function day(dayKey: string, partial: Partial<DayAggregate>): DayAggregate {
  return { day: dayKey, sold: 0, returned: 0, received: 0, delta: 0, peak: 0, close: 0, lastSaleAt: null, ...partial };
}

describe('ventana del período', () => {
  it('son N días completos anteriores a hoy, del más antiguo al de ayer, y aparte hoy', () => {
    expect(window7.completeDays).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
    expect(window7.today).toBe('2026-10-23');
  });

  it('cruza meses y años sin zona horaria de por medio', () => {
    const w = liveWindow({ year: 2027, month: 1, day: 2 }, 3);
    expect(w.completeDays).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('un período o umbral desconocido cae al de fábrica', () => {
    expect(parsePeriod('30')).toBe(30);
    expect(parsePeriod('31')).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
    expect(parseLowCoverage('3')).toBe(3);
    expect(parseLowCoverage('-1')).toBe(7);
  });
});

describe('métricas de un producto', () => {
  it('sin movimientos en el período: stock constante, sin ventas, días restantes vacíos', () => {
    const m = computeLiveMetrics(12, [], window7, { lowCoverageDays: 7 });
    expect(m.opening).toBe(12);
    expect(m.sold).toBe(0);
    expect(m.availableDays).toBe(7);
    expect(m.dailyVelocity).toBeNull();
    expect(m.coverageDays).toBeNull();
    expect(m.sellThroughPct).toBe(0);
    expect(m.status).toBe('NO_SALES');
  });

  it('reconstruye el stock inicial desde el actual y calcula el sell-through', () => {
    // Empezó con 10, llegaron 20 el día 2, se vendieron 3 por día los 7 días: queda 9.
    const days = window7.completeDays.map((key, i) =>
      day(key, {
        sold: 3,
        received: i === 1 ? 20 : 0,
        delta: (i === 1 ? 20 : 0) - 3,
        peak: 10 + (i >= 1 ? 20 : 0) - 3 * i,
        close: 10 + (i >= 1 ? 20 : 0) - 3 * (i + 1),
      })
    );
    const m = computeLiveMetrics(9, days, window7, { lowCoverageDays: 2 });
    expect(m.opening).toBe(10);
    expect(m.received).toBe(20);
    expect(m.sold).toBe(21);
    expect(m.sellThroughPct).toBeCloseTo(70, 5);
    expect(m.dailyVelocity).toBe(3);
    expect(m.coverageDays).toBe(3);
    expect(m.status).toBe('OK');
  });

  it('los días agotados no bajan la venta diaria', () => {
    // 4 días con stock vendiendo 5 por día; luego 3 días agotado; llegan 50 hoy.
    const days = window7.completeDays.map((key, i) =>
      i < 4 ? day(key, { sold: 5, delta: -5, peak: 20 - 5 * i, close: 15 - 5 * i }) : day(key, {})
    );
    days.push(day(window7.today, { received: 50, delta: 50, peak: 50, close: 50 }));
    const m = computeLiveMetrics(50, days, window7, { lowCoverageDays: 7 });
    expect(m.availableDays).toBe(4);
    expect(m.dailyVelocity).toBe(5);
    expect(m.coverageDays).toBe(10);
  });

  it('un día sin movimientos hereda el saldo del día anterior (agotado sigue agotado)', () => {
    const [d1] = window7.completeDays;
    // Se agotó el primer día y no volvió a entrar: los otros seis días no tuvo stock.
    const m = computeLiveMetrics(0, [day(d1!, { sold: 4, delta: -4, peak: 4, close: 0 })], window7, { lowCoverageDays: 7 });
    expect(m.availableDays).toBe(1);
    expect(m.status).toBe('OUT');
    expect(m.coverageDays).toBe(0);
  });

  it('lo vendido descuenta devoluciones y hoy no entra en la venta diaria', () => {
    const days = [
      ...window7.completeDays.map((key) => day(key, { sold: 2, delta: -2, peak: 100, close: 98 })),
      day(window7.today, { sold: 10, returned: 4, delta: -6, peak: 100, close: 94 }),
    ];
    const m = computeLiveMetrics(94, days, window7, { lowCoverageDays: 7 });
    expect(m.soldToday).toBe(6);
    expect(m.sold).toBe(14 + 6);
    expect(m.dailyVelocity).toBe(2);
    expect(m.coverageDays).toBe(47);
  });

  it('se agota pronto cuando los días restantes llegan al umbral', () => {
    const days = window7.completeDays.map((key) => day(key, { sold: 10, delta: -10, peak: 200, close: 190 }));
    expect(computeLiveMetrics(70, days, window7, { lowCoverageDays: 7 }).status).toBe('LOW');
    expect(computeLiveMetrics(80, days, window7, { lowCoverageDays: 7 }).status).toBe('OK');
  });

  it('ignora lo que cae fuera de la ventana y nunca pasa del 100% ni baja de 0%', () => {
    const outside = day('2026-01-01', { sold: 999, delta: -999, peak: 999, close: 0 });
    const oversold = [day(window7.completeDays[0]!, { sold: 8, delta: -8, peak: 0, close: -3 })];
    expect(computeLiveMetrics(5, [outside], window7, { lowCoverageDays: 7 }).sold).toBe(0);
    expect(computeLiveMetrics(-3, oversold, window7, { lowCoverageDays: 7 }).sellThroughPct).toBe(100);
    const refunds = [day(window7.completeDays[0]!, { returned: 3, delta: 3, peak: 8, close: 8 })];
    expect(computeLiveMetrics(8, refunds, window7, { lowCoverageDays: 7 }).sellThroughPct).toBe(0);
  });
});

describe('resumen de la bodega', () => {
  it('suma lo vendido y cuenta agotados con demanda aparte', () => {
    const summary = summarizeLive([
      { sold: 10, soldToday: 1, opening: 20, received: 0, status: 'OK' },
      { sold: 5, soldToday: 0, opening: 5, received: 0, status: 'OUT' },
      { sold: 0, soldToday: 0, opening: 0, received: 0, status: 'OUT' },
      { sold: 0, soldToday: 0, opening: 4, received: 0, status: 'NO_SALES' },
    ]);
    expect(summary.products).toBe(4);
    expect(summary.sold).toBe(15);
    expect(summary.soldToday).toBe(1);
    expect(summary.sellThroughPct).toBeCloseTo((15 / 29) * 100, 5);
    expect(summary.out).toBe(2);
    expect(summary.outWithDemand).toBe(1);
    expect(summary.noSales).toBe(1);
  });

  it('sin nada que vender no hay sell-through', () => {
    expect(summarizeLive([]).sellThroughPct).toBeNull();
  });
});

describe('horas en pantalla', () => {
  it('se leen en Santiago, en 24 horas y solo con dígitos (iguales en el servidor y en el navegador)', () => {
    expect(clockLabel(new Date('2026-10-23T20:53:07Z'))).toBe('17:53:07');
    expect(dayTimeLabel(new Date('2026-10-23T20:53:07Z'))).toBe('23/10 17:53');
    // Ya es 24 en UTC, todavía 23 en Chile.
    expect(dayTimeLabel(new Date('2026-10-24T02:30:00Z'))).toBe('23/10 23:30');
  });
});

describe('devoluciones de venta en el kardex', () => {
  it('Ventas sigue escribiendo las referencias que el panel reconoce como devolución', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/modules/sales/services/sales.service.ts'), 'utf8');
    // Nota de crédito que reingresa stock y anulación de una venta.
    expect(source).toContain("type: 'ADJUSTMENT_IN',\n            quantity: item.quantity,\n            unitCost: restockUnitCost,\n            reference: `DTE ${dteLabel} Folio #");
    expect(source).toContain('`Anulación (${reason}): DTE ${dteLabel} Folio #');
    expect(source).toContain('`Anulación DTE ${dteLabel} Folio #');
    const like = (pattern: string) => new RegExp(`^${pattern.replace(/%/g, '.*')}$`);
    expect(like(SALE_REVERSAL_LIKE[0]).test('DTE Nota de Crédito Electrónica Folio #12')).toBe(true);
    expect(like(SALE_REVERSAL_LIKE[1]).test('Anulación (error de digitación): DTE Boleta Electrónica Folio #7')).toBe(true);
    expect(like(SALE_REVERSAL_LIKE[1]).test('Anulación Recepción #4')).toBe(false);
  });
});

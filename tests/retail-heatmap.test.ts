import {
  HEATMAP_DAYS,
  HEATMAP_WEEKS,
  bucketSeries,
  describeReaction,
  detectPriceChanges,
  heatmapColumns,
  intensityLevel,
  lastDays,
  modalPrices,
  priceReaction,
  weekStart,
} from '@/lib/retail/heatmap';
import { dailySeries, type DayAggregate, type DayPoint } from '@/lib/retail/live-metrics';

/**
 * Mapa de calor: que un período sin stock no parezca "no se vendió", que las
 * semanas sean de lunes a domingo, y que un cambio de precio salga de lo
 * cobrado y se compare solo con días comparables (o diga que faltan datos).
 */

const TODAY = { year: 2026, month: 10, day: 23 }; // viernes

describe('columnas', () => {
  it('semanas de lunes a domingo, la última a medias hasta hoy', () => {
    const columns = heatmapColumns(TODAY, 'semana');
    expect(columns).toHaveLength(HEATMAP_WEEKS);
    expect(weekStart('2026-10-23')).toBe('2026-10-19');
    expect(columns[HEATMAP_WEEKS - 1]).toMatchObject({ key: '2026-10-19', label: '19/10', days: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'] });
    expect(columns[0]!.days).toHaveLength(7);
    expect(columns[0]!.key).toBe('2026-08-03');
  });

  it('días: los últimos 28, hoy incluido', () => {
    const columns = heatmapColumns(TODAY, 'dia');
    expect(columns).toHaveLength(HEATMAP_DAYS);
    expect(columns.at(-1)!.key).toBe('2026-10-23');
    expect(lastDays({ year: 2027, month: 1, day: 1 }, 3)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });
});

describe('celdas', () => {
  const day = (key: string, partial: Partial<DayAggregate>): DayAggregate => ({ day: key, sold: 0, returned: 0, received: 0, delta: 0, peak: 0, close: 0, lastSaleAt: null, ...partial });

  it('suma la venta neta y cuenta los días con stock de cada período', () => {
    const keys = ['2026-10-19', '2026-10-20', '2026-10-21'];
    // Abre con 4, vende 4 el lunes (se agota), sin stock el martes, llegan 10 y se venden 3 el miércoles.
    const series = dailySeries(7, [day(keys[0]!, { sold: 4, delta: -4, peak: 4, close: 0 }), day(keys[2]!, { sold: 3, received: 10, delta: 7, peak: 10, close: 7 })], keys);
    expect(series.map((point) => point.available)).toEqual([true, false, true]);
    const [cell] = bucketSeries(series, [{ key: keys[0]!, label: '19/10', days: keys }]);
    expect(cell).toEqual({ sold: 7, availableDays: 2, totalDays: 3 });
  });

  it('cinco niveles de color contra el máximo del mapa; cero es sin color', () => {
    expect([0, 1, 20, 21, 50, 100, 150].map((value) => intensityLevel(value, 100))).toEqual([0, 1, 1, 2, 3, 5, 5]);
    expect(intensityLevel(5, 0)).toBe(0);
  });
});

describe('cambios de precio', () => {
  it('el precio del día es el que más unidades vendió (en empate, el menor)', () => {
    expect(
      modalPrices([
        { day: '2026-10-01', price: 1000, quantity: 5 },
        { day: '2026-10-01', price: 900, quantity: 2 },
        { day: '2026-10-02', price: 1000, quantity: 3 },
        { day: '2026-10-02', price: 950, quantity: 3 },
      ])
    ).toEqual([
      { day: '2026-10-01', price: 1000 },
      { day: '2026-10-02', price: 950 },
    ]);
  });

  it('un cambio cuenta si se sostiene dos días de venta; una venta suelta o un 1% no', () => {
    const modal = [
      { day: '2026-09-01', price: 1000 },
      { day: '2026-09-02', price: 1005 }, // 0,5%: ruido
      { day: '2026-09-03', price: 800 }, // un solo día: promoción suelta
      { day: '2026-09-04', price: 1000 },
      { day: '2026-09-10', price: 900 },
      { day: '2026-09-11', price: 900 },
      { day: '2026-09-20', price: 950 }, // último día: todavía no se puede confirmar
    ];
    expect(detectPriceChanges(modal)).toEqual([{ day: '2026-09-10', from: 1000, to: 900 }]);
  });

  const series = (from: string, values: Array<[sold: number, available: boolean]>): DayPoint[] => {
    const [y, m, d] = from.split('-').map(Number) as [number, number, number];
    return values.map(([sold, available], i) => {
      const date = new Date(Date.UTC(y, m - 1, d + i));
      return { day: date.toISOString().slice(0, 10), sold, available };
    });
  };

  it('compara venta diaria antes y después solo en días con stock, sin contar hoy', () => {
    // 10 días a 2 por día (uno sin stock), cambio el día 11, luego 8 días a 3 por día; el último es hoy.
    const points = series('2026-09-01', [
      ...Array.from({ length: 10 }, (_, i): [number, boolean] => (i === 4 ? [0, false] : [2, true])),
      ...Array.from({ length: 8 }, (): [number, boolean] => [3, true]),
    ]);
    const reaction = priceReaction({ day: '2026-09-11', from: 1000, to: 900 }, points, { previousChange: null, nextChange: null, today: '2026-09-18' });
    expect(reaction).toMatchObject({ status: 'OK', daysBefore: 9, daysAfter: 7, velocityBefore: 2, velocityAfter: 3 });
    expect(reaction.priceChangePct).toBeCloseTo(-10, 5);
    expect(reaction.volumeChangePct).toBeCloseTo(50, 5);
    expect(describeReaction(reaction)).toBe('Bajó el precio 10% y la venta diaria subió 50%.');
  });

  it('sin días suficientes a cada lado lo dice, sin inventar la cifra', () => {
    const points = series('2026-09-01', Array.from({ length: 8 }, (): [number, boolean] => [1, true]));
    const reaction = priceReaction({ day: '2026-09-06', from: 1000, to: 1100 }, points, { previousChange: null, nextChange: null, today: '2026-09-08' });
    expect(reaction).toMatchObject({ status: 'INSUFFICIENT', daysBefore: 5, daysAfter: 2, volumeChangePct: null, velocityBefore: null });
    expect(describeReaction(reaction)).toContain('todavía no hay 5 días con stock a cada lado');
  });

  it('no cruza el cambio anterior ni el siguiente', () => {
    const points = series('2026-09-01', Array.from({ length: 30 }, (): [number, boolean] => [1, true]));
    const reaction = priceReaction({ day: '2026-09-11', from: 1000, to: 900 }, points, { previousChange: '2026-09-08', nextChange: '2026-09-15', today: '2026-10-01' });
    expect(reaction.daysBefore).toBe(3);
    expect(reaction.daysAfter).toBe(4);
    expect(reaction.status).toBe('INSUFFICIENT');
  });
});

import { addDays, demandPattern, describePattern, forecastFor, isPayday, medianLeadDays, planReorder, weekdayOf } from '@/lib/retail/reorder';
import type { DayPoint } from '@/lib/retail/live-metrics';

/**
 * Reposición predictiva: el ritmo sale de los días con stock, un patrón solo
 * se usa si hay datos para sostenerlo, y sin ritmo no se proyecta nada.
 */

/** `count` días completos que terminan ayer (hoy = 2026-10-23, viernes). */
function history(count: number, value: (key: string, index: number) => [sold: number, available: boolean]): DayPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const key = addDays('2026-10-23', i - count);
    const [sold, available] = value(key, i);
    return { day: key, sold, available };
  });
}

describe('calendario', () => {
  it('días de la semana y días de pago', () => {
    expect(weekdayOf('2026-10-19')).toBe(0); // lunes
    expect(weekdayOf('2026-10-25')).toBe(6); // domingo
    expect(['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-15', '2026-10-17', '2026-10-28', '2026-10-31'].map(isPayday)).toEqual([true, true, false, true, false, true, true]);
  });

  it('mediana del tiempo de entrega, con al menos dos recepciones', () => {
    expect(medianLeadDays([5])).toBeNull();
    expect(medianLeadDays([3, 9, 5])).toBe(5);
    expect(medianLeadDays([2, 4, 6, 10])).toBe(5);
  });
});

describe('patrón de demanda', () => {
  it('el ritmo base cuenta solo los días con stock', () => {
    const pattern = demandPattern(history(28, (_key, i) => (i % 2 ? [0, false] : [4, true])));
    expect(pattern.base).toBe(4);
    expect(pattern.baseDays).toBe(14);
  });

  it('sin 7 días con stock o sin ventas no hay ritmo', () => {
    expect(demandPattern(history(28, (_key, i) => (i < 6 ? [3, true] : [0, false]))).base).toBeNull();
    expect(demandPattern(history(28, () => [0, true])).base).toBeNull();
  });

  it('detecta el fin de semana y lo normaliza para que la semana promedie 1', () => {
    const pattern = demandPattern(history(84, (key) => [weekdayOf(key) >= 5 ? 10 : 5, true]));
    expect(pattern.weekdayDetected).toBe(true);
    expect(pattern.weekday.reduce((sum, value) => sum + value, 0) / 7).toBeCloseTo(1, 6);
    expect(pattern.weekday[5]! / pattern.weekday[0]!).toBeCloseTo(2, 6);
    expect(describePattern(pattern)).toMatch(/más los sábados|más los domingos/);
  });

  it('con pocas unidades no se cree un patrón: se proyecta plano', () => {
    const pattern = demandPattern(history(84, (key, i) => [weekdayOf(key) === 5 && i % 14 === 0 ? 1 : 0, true]));
    expect(pattern.weekdayDetected).toBe(false);
    expect(pattern.paydayDetected).toBe(false);
  });

  it('detecta los días de pago y el mes sigue promediando 1', () => {
    const pattern = demandPattern(history(84, (key) => [isPayday(key) ? 9 : 6, true]));
    expect(pattern.paydayDetected).toBe(true);
    expect(pattern.payday / pattern.otherDays).toBeCloseTo(1.5, 1);
    const share = 8 / 30;
    expect(share * pattern.payday + (1 - share) * pattern.otherDays).toBeCloseTo(1, 6);
    expect(describePattern(pattern)).toContain('más en días de pago');
  });
});

describe('plan de reposición', () => {
  const flat = demandPattern(history(28, () => [5, true]));

  it('se agota cuando la venta acumulada alcanza el stock más lo que viene en camino', () => {
    const plan = planReorder({ pattern: flat, stock: 40, incoming: 10, today: '2026-10-23', leadDays: 7, coverDays: 14 });
    expect(forecastFor(flat, '2026-10-24')).toBe(5);
    expect(plan.daysToStockout).toBe(10);
    expect(plan.stockoutDay).toBe('2026-11-02');
    expect(plan.orderBy).toBe('2026-10-26');
    expect(plan.status).toBe('SOON');
    // 21 días de venta (7 de entrega + 14 de cobertura) = 105, menos 50 entre stock y en camino.
    expect(plan.suggestedQty).toBe(55);
  });

  it('pedir ya cuando el stock no alcanza a cubrir la entrega', () => {
    const plan = planReorder({ pattern: flat, stock: 20, incoming: 0, today: '2026-10-23', leadDays: 7, coverDays: 14 });
    expect(plan.status).toBe('NOW');
    expect(plan.orderBy).toBe('2026-10-23');
    const empty = planReorder({ pattern: flat, stock: 0, incoming: 0, today: '2026-10-23', leadDays: 3, coverDays: 7 });
    expect(empty).toMatchObject({ daysToStockout: 0, status: 'NOW', suggestedQty: 50 });
  });

  it('con stock de sobra está al día y no sugiere pedir; sin ritmo no proyecta', () => {
    const plenty = planReorder({ pattern: flat, stock: 5000, incoming: 0, today: '2026-10-23', leadDays: 7, coverDays: 14 });
    expect(plenty).toMatchObject({ status: 'OK', daysToStockout: null, suggestedQty: 0 });
    const none = planReorder({ pattern: demandPattern(history(28, () => [0, false])), stock: 10, incoming: 0, today: '2026-10-23', leadDays: 7, coverDays: 14 });
    expect(none).toMatchObject({ status: 'NO_RATE', suggestedQty: 0, stockoutDay: null });
  });
});

describe('ruido', () => {
  it('diferencias chicas entre días de la semana no cambian la proyección', () => {
    // Lunes vende 5,5 y el resto 5: menos de 15% de diferencia, se proyecta plano.
    const pattern = demandPattern(history(84, (key) => [weekdayOf(key) === 0 ? 5.5 : 5, true]));
    expect(pattern.weekdayDetected).toBe(false);
    expect(pattern.weekday).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

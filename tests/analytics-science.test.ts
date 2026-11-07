import { analyzeSales } from '@/lib/analytics/science';
import type { DailyMetric } from '@/lib/analytics/types';

function history(count: number, sales: (index: number) => number = () => 100): DailyMetric[] {
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    netSales: sales(index), purchases: 0, income: 0, expense: 0, documents: 0,
  }));
}

describe('análisis estadístico de ventas', () => {
  it('no inventa una proyección sin documentos, sin 28 días o con poca actividad', () => {
    expect(analyzeSales([], null)).toMatchObject({ status: 'insufficient', sampleDays: 0, forecast: [] });
    expect(analyzeSales(history(27), '2026-01-01').status).toBe('insufficient');
    expect(analyzeSales(history(90, (i) => i < 7 ? 100 : 0), '2026-01-01').status).toBe('insufficient');
    expect(analyzeSales(history(28, () => 0), '2026-01-01').forecast).toEqual([]);
  });

  it('descarta el relleno previo al primer documento y conserva los ceros posteriores', () => {
    expect(analyzeSales(history(60), '2026-02-15')).toMatchObject({ status: 'insufficient', sampleDays: 15 });
    const result = analyzeSales(history(28, (i) => i % 7 < 5 ? 100 : 0), '2026-01-01');
    expect(result.status).toBe('ready');
    expect(result.sampleDays).toBe(28);
    expect(result.forecast.map((point) => point.expected)).toEqual([100, 100, 100, 100, 100, 0, 0]);
    expect(result.backtestMae).toBeNull();
  });

  it('una historia constante tiene rango observado constante, sin anomalías y error cero', () => {
    const result = analyzeSales(history(56), '2026-01-01');
    expect(result.status).toBe('ready');
    expect(result.forecast).toHaveLength(7);
    expect(result.forecast[0]).toEqual({ date: '2026-02-26', expected: 100, lower: 100, upper: 100 });
    expect(result.trendPercent).toBe(0);
    expect(result.backtestMae).toBe(0);
    expect(result.anomalies).toEqual([]);
    expect(result.method).toContain('no un intervalo de confianza');
  });

  it('aprende el día semanal y usa solo las últimas ocho semanas para proyectar', () => {
    const result = analyzeSales(history(84, (i) => i < 28 ? 10_000 : (i % 7 + 1) * 100), '2026-01-01');
    expect(result.forecast.map((point) => point.expected)).toEqual([100, 200, 300, 400, 500, 600, 700]);
    expect(result.forecast.map((point) => [point.lower, point.upper])).toEqual([
      [100, 100], [200, 200], [300, 300], [400, 400], [500, 500], [600, 600], [700, 700],
    ]);
  });

  it('conserva los importes negativos en la estimación y en la variabilidad observada', () => {
    const result = analyzeSales(history(56, (i) => i % 7 === 6 ? -100 * (Math.floor(i / 7) + 1) : 100), '2026-01-01');
    expect(result.forecast[6]).toMatchObject({ expected: -450, lower: -800, upper: -100 });
    expect(result.forecast.every((point) => point.lower <= point.expected && point.expected <= point.upper)).toBe(true);
  });

  it('el valor inusual no entra en su propio ajuste ni en las pruebas anteriores', () => {
    const result = analyzeSales(history(56, (i) => i === 49 ? 800 : 100), '2026-01-01');
    expect(result.anomalies).toEqual([{ date: '2026-02-19', actual: 800, expected: 100, direction: 'high' }]);
    expect(result.backtestMae).toBe(100); // |800 - 100| / 7, nunca ajustado con el propio 800.
    const futureSpike = analyzeSales(history(56, (i) => i === 55 ? 100_000 : 100), '2026-01-01');
    expect(futureSpike.anomalies).toEqual([{ date: '2026-02-25', actual: 100_000, expected: 100, direction: 'high' }]);
    expect(futureSpike.backtestMae).toBe(Math.round(99_900 / 7));
  });

  it('no calcula una tasa de cambio con base cero o negativa', () => {
    expect(analyzeSales(history(56, (i) => i >= 28 && i < 42 ? 0 : 100), '2026-01-01').trendPercent).toBeNull();
    expect(analyzeSales(history(56, (i) => i >= 28 && i < 42 ? -100 : 100), '2026-01-01').trendPercent).toBeNull();
  });

  it('rechaza huecos, duplicados y valores no finitos en vez de imputarlos', () => {
    const missing = history(56).filter((_point, index) => index !== 20);
    expect(analyzeSales(missing, '2026-01-01').status).toBe('insufficient');
    expect(analyzeSales([...history(56), history(56)[20]!], '2026-01-01').status).toBe('insufficient');
    expect(analyzeSales(history(56, (i) => i === 20 ? NaN : 100), '2026-01-01').status).toBe('insufficient');
  });
});

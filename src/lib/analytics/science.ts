import type { DailyMetric, ScienceResult } from './types';

const MIN_DAYS = 28;
const MIN_ACTIVE_DAYS = 8;
const WINDOW_DAYS = 56;
const HORIZON_DAYS = 7;
const METHOD = 'Promedio del mismo día de la semana en las últimas 8 semanas (mínimo 4 observaciones). El rango muestra el mínimo y máximo observados de ese día: es variabilidad histórica, no un intervalo de confianza ni una garantía. Las señales inusuales comparan con mediana y dispersión robusta anteriores; no explican sus causas. El error histórico es el error absoluto medio de 7 pruebas sucesivas, usando solo datos anteriores a cada fecha.';

/** Calendario de fechas de negocio, sin convertir la medianoche chilena a UTC. */
function dayNumber(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const value = Date.parse(`${key}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === key
    ? value / 86_400_000
    : null;
}

function nextDay(key: string, offset: number): string {
  return new Date((dayNumber(key)! + offset) * 86_400_000).toISOString().slice(0, 10);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Siempre hacia atrás: el candidato ni los días posteriores entran al ajuste. */
function weekdaySample(history: readonly DailyMetric[], target: string): number[] {
  const targetDay = dayNumber(target)!;
  return history
    .filter((point) => {
      const distance = targetDay - dayNumber(point.date)!;
      return distance > 0 && distance <= WINDOW_DAYS && distance % 7 === 0;
    })
    .map((point) => point.netSales);
}

function insufficient(reason: string, sampleDays: number): ScienceResult {
  return {
    status: 'insufficient', reason, method: METHOD, sampleDays,
    trendPercent: null, forecast: [], anomalies: [], backtestMae: null,
  };
}

/**
 * Recibe días COMPLETOS y consecutivos. Un cero dentro de la historia es un
 * día real sin venta neta; los días anteriores al primer documento no son
 * observaciones. No imputa huecos ni entrena sobre el día aún en curso.
 */
export function analyzeSales(daily: readonly DailyMetric[], observationStart: string | null): ScienceResult {
  if (!observationStart || dayNumber(observationStart) === null) {
    return insufficient('Datos insuficientes: no hay una fecha inicial de ventas registradas.', 0);
  }
  const observed = daily.filter((point) => point.date >= observationStart).sort((a, b) => a.date.localeCompare(b.date));
  for (let index = 0; index < observed.length; index += 1) {
    const point = observed[index]!;
    const number = dayNumber(point.date);
    if (number === null || !Number.isFinite(point.netSales)
      || (index > 0 && number !== dayNumber(observed[index - 1]!.date)! + 1)) {
      return insufficient('Datos insuficientes: el historial necesita días completos, consecutivos y sin duplicados.', observed.length);
    }
  }
  if (observed.length < MIN_DAYS) {
    return insufficient(`Datos insuficientes: se requieren ${MIN_DAYS} días completos desde la primera venta registrada.`, observed.length);
  }
  if (observed.filter((point) => point.netSales > 0).length < MIN_ACTIVE_DAYS) {
    return insufficient(`Datos insuficientes: se requieren al menos ${MIN_ACTIVE_DAYS} días con venta neta positiva.`, observed.length);
  }

  const lastDate = observed[observed.length - 1]!.date;
  const forecast = Array.from({ length: HORIZON_DAYS }, (_, index) => {
    const date = nextDay(lastDate, index + 1);
    const values = weekdaySample(observed, date);
    return {
      date,
      expected: Math.round(mean(values)),
      lower: Math.floor(Math.min(...values)),
      upper: Math.ceil(Math.max(...values)),
    };
  });
  // Una serie consecutiva de 28 días aporta cuatro muestras por día semanal.
  // Esta comprobación también conserva el fallo cerrado si cambia el horizonte.
  if (forecast.some((point) => weekdaySample(observed, point.date).length < 4)) {
    return insufficient('Datos insuficientes: faltan cuatro observaciones de cada día de la semana.', observed.length);
  }

  const recent = observed.slice(-14).reduce((sum, point) => sum + point.netSales, 0);
  const previous = observed.slice(-28, -14).reduce((sum, point) => sum + point.netSales, 0);
  const anomalies: ScienceResult['anomalies'] = [];
  for (const point of observed.slice(-HORIZON_DAYS)) {
    const values = weekdaySample(observed, point.date);
    if (values.length < 4) continue;
    const center = median(values);
    const mad = median(values.map((value) => Math.abs(value - center)));
    // El mínimo relativo evita señalar ruido de centavos en historias planas.
    const threshold = Math.max(3 * 1.4826 * mad, Math.abs(center) * 0.25, 1);
    if (Math.abs(point.netSales - center) > threshold) {
      anomalies.push({
        date: point.date, actual: point.netSales, expected: Math.round(center),
        direction: point.netSales > center ? 'high' : 'low',
      });
    }
  }

  let backtestMae: number | null = null;
  // Todas las pruebas tienen al menos cuatro semanas anteriores. No se evalúa
  // un subconjunto escogido entre los últimos siete días.
  if (observed.length >= MIN_DAYS + HORIZON_DAYS) {
    const errors = observed.slice(-HORIZON_DAYS).map((point) =>
      Math.abs(point.netSales - mean(weekdaySample(observed, point.date))),
    );
    backtestMae = Math.round(mean(errors));
  }

  return {
    status: 'ready',
    reason: 'Estimación estadística de ventas netas sobre registros del ERP; puede cambiar y no anticipa hechos externos ni demanda no registrada.',
    method: METHOD,
    sampleDays: observed.length,
    trendPercent: previous > 0 ? Math.round(((recent - previous) / previous) * 10_000) / 100 : null,
    forecast,
    anomalies,
    backtestMae,
  };
}

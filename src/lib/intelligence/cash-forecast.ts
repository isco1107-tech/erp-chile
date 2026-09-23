/**
 * Caja proyectada a 13 semanas: el horizonte estándar de tesorería para
 * anticipar un descalce ANTES de que ocurra. Todo sale de compromisos reales
 * con fecha (facturas por cobrar/pagar, cuotas, pagarés, remuneraciones e
 * IVA estimado), no de una extrapolación.
 */

export type ForecastFlowKind = 'receivable' | 'installment' | 'promissory' | 'payable' | 'payroll' | 'tax' | 'expense';

export const FORECAST_KIND_LABEL: Record<ForecastFlowKind, string> = {
  receivable: 'Cobros de facturas',
  installment: 'Cuotas por cobrar',
  promissory: 'Pagarés por cobrar',
  payable: 'Pagos a proveedores',
  payroll: 'Remuneraciones',
  tax: 'Impuestos (F29)',
  expense: 'Rendiciones por reembolsar',
};

export const INFLOW_KINDS: ForecastFlowKind[] = ['receivable', 'installment', 'promissory'];

export interface ForecastFlow {
  date: Date;
  /** Siempre positivo; la dirección la da `kind`. */
  amount: number;
  kind: ForecastFlowKind;
  label: string;
}

export interface WeekBucket {
  index: number;
  start: Date;
  end: Date;
  inflows: number;
  outflows: number;
  net: number;
  byKind: Record<ForecastFlowKind, number>;
}

export interface WeeklyForecast {
  weeks: WeekBucket[];
  /** Por cobrar con vencimiento ya pasado: no se asume que entra, se muestra aparte. */
  overdueInflows: number;
  /** Por pagar ya vencido: se asume en la semana 1 (es deuda exigible hoy). */
  overdueOutflows: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function emptyByKind(): Record<ForecastFlowKind, number> {
  return { receivable: 0, installment: 0, promissory: 0, payable: 0, payroll: 0, tax: 0, expense: 0 };
}

export function isInflow(kind: ForecastFlowKind): boolean {
  return INFLOW_KINDS.includes(kind);
}

export function bucketByWeek(flows: readonly ForecastFlow[], start: Date, weekCount = 13): WeeklyForecast {
  const weeks: WeekBucket[] = Array.from({ length: weekCount }, (_, index) => ({
    index,
    start: new Date(start.getTime() + index * WEEK_MS),
    end: new Date(start.getTime() + (index + 1) * WEEK_MS),
    inflows: 0,
    outflows: 0,
    net: 0,
    byKind: emptyByKind(),
  }));
  const horizonEnd = start.getTime() + weekCount * WEEK_MS;
  let overdueInflows = 0;
  let overdueOutflows = 0;

  for (const flow of flows) {
    if (flow.amount <= 0) continue;
    const time = flow.date.getTime();
    const inflow = isInflow(flow.kind);
    if (time < start.getTime()) {
      if (inflow) {
        overdueInflows += flow.amount;
        continue;
      }
      overdueOutflows += flow.amount;
    }
    if (time >= horizonEnd) continue;
    const index = Math.max(0, Math.floor((time - start.getTime()) / WEEK_MS));
    const week = weeks[index];
    week.byKind[flow.kind] += flow.amount;
    if (inflow) week.inflows += flow.amount;
    else week.outflows += flow.amount;
  }

  for (const week of weeks) week.net = week.inflows - week.outflows;
  return { weeks, overdueInflows, overdueOutflows };
}

export interface BalancePoint {
  index: number;
  opening: number;
  closing: number;
}

/**
 * Saldo acumulado semana a semana. `overdueRecoveryPct` (0-100) reparte la
 * cobranza vencida en partes iguales en las primeras 4 semanas: recuperar
 * morosidad toma tiempo, no entra de golpe el lunes.
 */
export function runningBalance(forecast: WeeklyForecast, openingBalance: number, overdueRecoveryPct: number): BalancePoint[] {
  const recovered = (forecast.overdueInflows * Math.min(100, Math.max(0, overdueRecoveryPct))) / 100;
  const spreadWeeks = Math.min(4, forecast.weeks.length);
  let balance = openingBalance;
  return forecast.weeks.map((week) => {
    const opening = balance;
    const recovery = week.index < spreadWeeks ? recovered / spreadWeeks : 0;
    balance = Math.round(balance + week.net + recovery);
    return { index: week.index, opening, closing: balance };
  });
}

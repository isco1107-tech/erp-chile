import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';

export const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export interface AccountingPeriod {
  year: number;
  month: number;
  /** Medianoche del día 1 en Santiago (incluido). */
  from: Date;
  /** Medianoche del día 1 del mes siguiente en Santiago (excluido). */
  to: Date;
  label: string;
}

/**
 * Período contable desde los parámetros de la URL (`?year=2026&month=9`).
 * Valores ausentes o fuera de rango caen al mes en curso en Santiago, nunca a
 * un error: la URL la puede escribir cualquiera.
 */
export function parseAccountingPeriod(params: { year?: string; month?: string }, now: Date = new Date()): AccountingPeriod {
  const today = santiagoDateParts(now);
  const yearParam = Number(params.year);
  const monthParam = Number(params.month);
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : today.year;
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : today.month;
  const from = santiagoMidnightUtc(year, month, 1);
  const to = month === 12 ? santiagoMidnightUtc(year + 1, 1, 1) : santiagoMidnightUtc(year, month + 1, 1);
  return { year, month, from, to, label: `${MONTH_LABELS[month - 1]} ${year}` };
}

export function yearOptions(now: Date = new Date(), span = 6): number[] {
  const { year } = santiagoDateParts(now);
  return Array.from({ length: span }, (_, i) => year - i);
}

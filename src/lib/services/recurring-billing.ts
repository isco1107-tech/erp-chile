import type { BillingFrequency } from '@prisma/client';
import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';

/**
 * Cálculos puros de la facturación recurrente (contratos de servicio). Sin
 * base de datos, para poder testearlos: qué período se factura, cuándo toca
 * el siguiente y cuánto aporta cada contrato al ingreso mensual recurrente.
 *
 * Las fechas se razonan en el calendario de Santiago: un contrato que se
 * factura "el día 31" se factura el último día de los meses cortos, y vuelve
 * al 31 en los meses que lo tienen (el día ancla sale de `startDate`, no de
 * la última facturación, para no ir corriéndose a 28).
 */

export const MONTHS_PER_PERIOD: Record<BillingFrequency, number> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

export const BILLING_FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  MONTHLY: 'Mensual',
  BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Fecha de facturación que sigue a `current`, avanzando un período y
 * anclando el día al de `anchor` (normalmente la fecha de inicio del contrato).
 */
export function nextBillingDate(current: Date, frequency: BillingFrequency, anchor: Date): Date {
  const { year, month } = santiagoDateParts(current);
  const anchorDay = santiagoDateParts(anchor).day;
  const total = year * 12 + (month - 1) + MONTHS_PER_PERIOD[frequency];
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  return santiagoMidnightUtc(nextYear, nextMonth, Math.min(anchorDay, daysInMonth(nextYear, nextMonth)));
}

/**
 * Llave del período que se factura en `billingDate`: "2026-09" es el período
 * que empieza en septiembre de 2026. Es la llave de idempotencia de
 * `ServiceContractBilling` y del documento de venta generado.
 */
export function periodKeyFor(billingDate: Date): string {
  const { year, month } = santiagoDateParts(billingDate);
  return `${year}-${String(month).padStart(2, '0')}`;
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "septiembre 2026" o "septiembre–noviembre 2026" según la frecuencia, para la glosa del documento. */
export function periodLabel(billingDate: Date, frequency: BillingFrequency): string {
  const { year, month } = santiagoDateParts(billingDate);
  const months = MONTHS_PER_PERIOD[frequency];
  if (months === 1) return `${MONTH_NAMES[month - 1]} ${year}`;
  const endTotal = year * 12 + (month - 1) + months - 1;
  const endYear = Math.floor(endTotal / 12);
  const endMonth = (endTotal % 12) + 1;
  const start = MONTH_NAMES[month - 1];
  const end = MONTH_NAMES[endMonth - 1];
  return endYear === year ? `${start}–${end} ${year}` : `${start} ${year}–${end} ${endYear}`;
}

/** ¿Toca facturar? Contrato activo, fecha alcanzada y dentro de su vigencia. */
export function isBillingDue(
  contract: { status: string; nextBillingDate: Date; endDate: Date | null },
  now: Date
): boolean {
  if (contract.status !== 'ACTIVE') return false;
  if (contract.nextBillingDate.getTime() > now.getTime()) return false;
  return contract.endDate === null || contract.nextBillingDate.getTime() <= contract.endDate.getTime();
}

export interface ContractLineAmounts {
  quantity: number;
  unitPrice: number;
}

/** Neto (sin IVA) de un período del contrato, en pesos enteros. */
export function contractPeriodNet(lines: ContractLineAmounts[]): number {
  return lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0);
}

/** Aporte mensual normalizado (MRR): un contrato anual de $1.200.000 aporta $100.000 al mes. */
export function monthlyRecurringRevenue(lines: ContractLineAmounts[], frequency: BillingFrequency): number {
  return Math.round(contractPeriodNet(lines) / MONTHS_PER_PERIOD[frequency]);
}

/** Vencimiento del documento generado: fecha de facturación + días de plazo. */
export function dueDateFor(billingDate: Date, paymentTermDays: number): Date {
  return new Date(billingDate.getTime() + Math.max(0, paymentTermDays) * 24 * 60 * 60 * 1000);
}

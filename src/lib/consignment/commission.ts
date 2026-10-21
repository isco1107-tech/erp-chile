/**
 * Comisión de consignación: función pura, sin base de datos.
 *
 * Todo en CLP enteros. La comisión se redondea una sola vez sobre la base de la
 * línea y lo que se le debe al productor es el resto, de modo que
 * `commissionAmount + producerAmount === soldNet` siempre.
 *
 * Modelo tributario A1 (criterio a validar por contador): la venta es de la
 * empresa (boleta/factura por el total) y el productor le factura su parte.
 */
import { calculateIva } from '@/lib/chile/tax';

/** Sobre qué monto se aplica la comisión. */
export type CommissionBase = 'NET' | 'GROSS';

/**
 * Redondeo simétrico (mitad se aleja de cero). `Math.round(-2.5)` da -2 y
 * `Math.round(2.5)` da 3: una venta y su devolución exacta no sumarían cero.
 */
export function roundSymmetric(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return rounded === 0 ? 0 : rounded; // evita -0
}

export const MIN_COMMISSION_BPS = 0;
export const MAX_COMMISSION_BPS = 10_000;

export interface CommissionSplit {
  soldNet: number;
  commissionBps: number;
  commissionAmount: number;
  producerAmount: number;
}

export function isValidCommissionBps(bps: unknown): bps is number {
  return typeof bps === 'number' && Number.isInteger(bps) && bps >= MIN_COMMISSION_BPS && bps <= MAX_COMMISSION_BPS;
}

function assertBps(bps: number): void {
  if (!isValidCommissionBps(bps)) {
    throw new RangeError(`La comisión debe ser un entero entre ${MIN_COMMISSION_BPS} y ${MAX_COMMISSION_BPS} puntos base`);
  }
}

/**
 * Comisión efectiva: la del producto (si la tiene) manda sobre la del productor.
 * Un override de 0 es válido (producto sin comisión) y también manda.
 */
export function resolveCommissionBps(productOverrideBps: number | null | undefined, producerDefaultBps: number): number {
  const bps = productOverrideBps ?? producerDefaultBps;
  assertBps(bps);
  return bps;
}

/**
 * Reparte el neto de una línea entre la empresa (comisión) y el productor.
 * Una devolución (neto negativo) se reparte con el mismo criterio y signo.
 */
export function splitConsignmentSale(
  soldNet: number,
  commissionBps: number,
  opts: { base?: CommissionBase; saleIva?: number } = {}
): CommissionSplit {
  if (!Number.isInteger(soldNet)) throw new RangeError('El neto de la línea debe ser un entero en CLP');
  assertBps(commissionBps);
  const commissionBase = opts.base === 'GROSS' ? soldNet + (opts.saleIva ?? 0) : soldNet;
  const commissionAmount = roundSymmetric((commissionBase * commissionBps) / 10_000);
  return { soldNet, commissionBps, commissionAmount, producerAmount: soldNet - commissionAmount };
}

export interface SettlementTotals {
  totalSold: number;
  totalCommission: number;
  totalDue: number;
  /** Parte del productor sobre líneas afectas a IVA (neto). */
  producerNetAffected: number;
  /** Parte del productor sobre líneas exentas. */
  producerExempt: number;
  /** IVA de la factura del productor: calculado UNA vez sobre el neto afecto agregado. */
  producerIva: number;
  /** Total que el productor debe facturar y la empresa pagarle. */
  totalPayable: number;
}

/** Suma las líneas congeladas de una liquidación: `totalSold = totalCommission + totalDue`. */
export function summarizeSettlementLines(
  lines: ReadonlyArray<Pick<CommissionSplit, 'soldNet' | 'commissionAmount' | 'producerAmount'> & { isExempt?: boolean }>
): SettlementTotals {
  let totalSold = 0;
  let totalCommission = 0;
  let totalDue = 0;
  let producerNetAffected = 0;
  let producerExempt = 0;
  for (const line of lines) {
    totalSold += line.soldNet;
    totalCommission += line.commissionAmount;
    totalDue += line.producerAmount;
    if (line.isExempt) producerExempt += line.producerAmount;
    else producerNetAffected += line.producerAmount;
  }
  const producerIva = roundSymmetric(Math.sign(producerNetAffected) * calculateIva(Math.abs(producerNetAffected)));
  return {
    totalSold,
    totalCommission,
    totalDue,
    producerNetAffected,
    producerExempt,
    producerIva,
    totalPayable: producerNetAffected + producerExempt + producerIva,
  };
}

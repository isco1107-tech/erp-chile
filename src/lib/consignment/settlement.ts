import type { DocumentStatus, DteType } from '@prisma/client';
import { commissionOf, isValidCommissionBps } from './commission';

/**
 * Qué se le debe a un seller. Puro: recibe las líneas de venta ya leídas y devuelve lo pendiente.
 *
 * Se calcula sobre las líneas de los documentos de venta, no sobre el movimiento de stock, para
 * que anular un documento o emitir una Nota de Crédito se reflejen solos:
 *
 *   pendiente de una línea = lo que vale hoy − lo que ya se liquidó
 *
 * Si un documento ya liquidado se anula, su línea vale 0 y el pendiente queda en negativo: es un
 * ajuste a favor de la empresa en la liquidación siguiente. Nada se reescribe hacia atrás.
 */

/** Tipos de documento que son una venta y suman al seller. */
export const SALE_DTE_TYPES = ['FACTURA_33', 'FACTURA_EXENTA_34', 'BOLETA_39', 'BOLETA_EXENTA_41'] as const;
/** Tipos que devuelven lo vendido y restan. */
export const RETURN_DTE_TYPES = ['NOTA_CREDITO_61'] as const;
/** Todos los que cuentan para una liquidación (para filtrar la consulta). */
export const SETTLEMENT_DTE_TYPES = [...SALE_DTE_TYPES, ...RETURN_DTE_TYPES] as const;

/** `1` suma, `-1` resta, `0` no cuenta (guías, cotizaciones y notas de débito no son una venta del seller). */
export function documentSign(dteType: string): 1 | -1 | 0 {
  if ((SALE_DTE_TYPES as readonly string[]).includes(dteType)) return 1;
  if ((RETURN_DTE_TYPES as readonly string[]).includes(dteType)) return -1;
  return 0;
}

/** Una línea de venta de un producto en consignación, tal como quedó guardada al vender. */
export interface ConsignedSaleLine {
  salesDocumentItemId: string;
  productId: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  /** Neto de la línea (después de descuento). Un producto exento lleva su monto exento. */
  subtotal: number;
  /** Comisión congelada al vender. */
  commissionBps: number | null;
  /**
   * Solo en una nota de crédito: la base neta que se le revierte al seller (la proporción de lo que se
   * le acreditó por esa unidad en la venta original). `null` = se usa el subtotal de la línea.
   */
  baseNet?: number | null;
  dteType: DteType;
  status: DocumentStatus;
}

export interface SettlementAmounts {
  quantity: number;
  netAmount: number;
  commissionAmount: number;
  payoutAmount: number;
}

export const ZERO_AMOUNTS: SettlementAmounts = { quantity: 0, netAmount: 0, commissionAmount: 0, payoutAmount: 0 };

/** Redondeo de cantidades (kilos y litros llevan hasta 3 decimales) para que 0,1 + 0,2 − 0,3 sea 0. */
function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Lo que vale hoy una línea para el seller. Solo cuenta un documento emitido; un borrador o uno
 * anulado vale 0. La Nota de Crédito resta lo que se le acreditó por esas unidades en la venta original
 * (`baseNet`), con el mismo redondeo y el signo aplicado al final, aunque la nota se emita a otro precio:
 * la diferencia de precio es de la empresa, no del seller. Una nota sin cantidad no descuenta nada (los
 * ajustes de precio llegan como líneas sin producto y se corrigen con el ajuste manual de la liquidación).
 */
export function currentContribution(line: ConsignedSaleLine): SettlementAmounts {
  if (line.status !== 'ISSUED') return ZERO_AMOUNTS;
  const sign = documentSign(line.dteType);
  if (sign === 0) return ZERO_AMOUNTS;
  if (sign === -1 && !(line.quantity > 0)) return ZERO_AMOUNTS;
  if (!isValidCommissionBps(line.commissionBps)) return ZERO_AMOUNTS;
  const net = sign === -1 && line.baseNet !== null && line.baseNet !== undefined ? line.baseNet : line.subtotal;
  const commission = commissionOf(net, line.commissionBps);
  return {
    quantity: roundQty(sign * line.quantity),
    netAmount: sign * net,
    commissionAmount: sign * commission,
    payoutAmount: sign * (net - commission),
  };
}

export interface PendingLine extends SettlementAmounts {
  salesDocumentItemId: string;
  productId: string | null;
  sku: string | null;
  description: string;
}

function isZero(amounts: SettlementAmounts): boolean {
  return amounts.quantity === 0 && amounts.netAmount === 0 && amounts.commissionAmount === 0 && amounts.payoutAmount === 0;
}

/**
 * Líneas con algo por liquidar: lo que valen hoy menos lo ya liquidado (`settled`, la suma de las
 * líneas de liquidaciones vigentes, por línea de venta). Las que no cambiaron no aparecen.
 */
export function pendingLines(lines: ConsignedSaleLine[], settled: ReadonlyMap<string, SettlementAmounts>): PendingLine[] {
  const pending: PendingLine[] = [];
  for (const line of lines) {
    const now = currentContribution(line);
    const before = settled.get(line.salesDocumentItemId) ?? ZERO_AMOUNTS;
    const delta: SettlementAmounts = {
      quantity: roundQty(now.quantity - before.quantity),
      netAmount: now.netAmount - before.netAmount,
      commissionAmount: now.commissionAmount - before.commissionAmount,
      payoutAmount: now.payoutAmount - before.payoutAmount,
    };
    if (isZero(delta)) continue;
    pending.push({
      salesDocumentItemId: line.salesDocumentItemId,
      productId: line.productId,
      sku: line.sku,
      description: line.description,
      ...delta,
    });
  }
  return pending;
}

export interface SettlementTotals {
  netSales: number;
  commissionAmount: number;
  /** Suma de las líneas, sin el ajuste manual. */
  linesPayout: number;
  adjustmentAmount: number;
  /** Lo que se le debe al seller: líneas + ajuste manual. */
  payoutAmount: number;
  units: number;
}

export function settlementTotals(lines: ReadonlyArray<SettlementAmounts>, adjustmentAmount = 0): SettlementTotals {
  const netSales = lines.reduce((sum, line) => sum + line.netAmount, 0);
  const commissionAmount = lines.reduce((sum, line) => sum + line.commissionAmount, 0);
  const linesPayout = lines.reduce((sum, line) => sum + line.payoutAmount, 0);
  const units = roundQty(lines.reduce((sum, line) => sum + line.quantity, 0));
  return { netSales, commissionAmount, linesPayout, adjustmentAmount, payoutAmount: linesPayout + adjustmentAmount, units };
}

/** Suma las líneas de liquidaciones vigentes por línea de venta de origen. */
export function sumSettledByItem(
  rows: ReadonlyArray<{ salesDocumentItemId: string } & SettlementAmounts>
): Map<string, SettlementAmounts> {
  const map = new Map<string, SettlementAmounts>();
  for (const row of rows) {
    const current = map.get(row.salesDocumentItemId) ?? ZERO_AMOUNTS;
    map.set(row.salesDocumentItemId, {
      quantity: roundQty(current.quantity + row.quantity),
      netAmount: current.netAmount + row.netAmount,
      commissionAmount: current.commissionAmount + row.commissionAmount,
      payoutAmount: current.payoutAmount + row.payoutAmount,
    });
  }
  return map;
}

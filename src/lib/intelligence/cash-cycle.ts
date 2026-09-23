import { safeDivide } from './stats';

/**
 * Ciclo de conversión de caja (CCC): cuántos días pasa la plata de la empresa
 * "atrapada" entre que paga a proveedores y cobra a clientes.
 *
 *   DSO = CxC / ventas brutas × días        (días de cobro)
 *   DIO = inventario / costo de ventas × días (días de inventario)
 *   DPO = CxP / compras brutas × días        (días de pago)
 *   CCC = DSO + DIO − DPO
 *
 * Ventas y compras van CON IVA porque los saldos por cobrar/pagar incluyen
 * IVA; mezclar neto con bruto infla el DSO en ~19%.
 */

export interface WorkingCapitalInput {
  receivables: number;
  payables: number;
  inventoryValue: number;
  /** Ventas brutas (con IVA) del período de referencia. */
  salesGross: number;
  /** Costo de ventas (PMP) del período de referencia. */
  costOfSales: number;
  /** Compras brutas (con IVA) del período de referencia. */
  purchasesGross: number;
  /** Largo del período de referencia en días (ej. 90). */
  days: number;
}

export interface CashCycle {
  dso: number | null;
  dio: number | null;
  dpo: number | null;
  ccc: number | null;
}

function days(balance: number, flow: number, period: number): number | null {
  const ratio = safeDivide(balance, flow);
  return ratio === null ? null : Math.round(ratio * period);
}

export function cashConversionCycle(input: WorkingCapitalInput): CashCycle {
  const dso = days(input.receivables, input.salesGross, input.days);
  const dio = input.inventoryValue > 0 ? days(input.inventoryValue, input.costOfSales, input.days) : null;
  const dpo = days(input.payables, input.purchasesGross, input.days);
  // Sin DSO no hay ciclo que medir. DIO/DPO ausentes cuentan como 0: una
  // empresa de servicios no tiene inventario y eso no invalida su ciclo.
  const ccc = dso === null ? null : dso + (dio ?? 0) - (dpo ?? 0);
  return { dso, dio, dpo, ccc };
}

/**
 * Caja que se libera (positivo) o se inmoviliza (negativo) al mover los días
 * de cobro/inventario/pago. Ej.: bajar el DSO 10 días con ventas de $36,5M
 * anuales libera $1M.
 */
export function workingCapitalImpact(
  annual: { salesGross: number; costOfSales: number; purchasesGross: number },
  deltaDays: { dso: number; dio: number; dpo: number }
): number {
  const perDaySales = annual.salesGross / 365;
  const perDayCost = annual.costOfSales / 365;
  const perDayPurchases = annual.purchasesGross / 365;
  return Math.round(-deltaDays.dso * perDaySales - deltaDays.dio * perDayCost + deltaDays.dpo * perDayPurchases);
}

import { workingCapitalImpact } from './cash-cycle';

/**
 * Simulador "¿qué pasaría si…?": parte de la base real de los últimos 12
 * meses y aplica palancas de negocio. Puro para correr en el navegador en
 * cada movimiento de un control sin pedir nada al servidor.
 */

export interface SimulatorBaseline {
  /** Ventas netas anuales (CLP). */
  netSales: number;
  /** Costo de ventas anual (CLP). */
  costOfSales: number;
  /** Compras brutas anuales (CLP, con IVA). */
  purchasesGross: number;
  /** Ventas brutas anuales (CLP, con IVA). */
  salesGross: number;
}

export interface SimulatorLevers {
  /** Variación % del precio de venta. */
  pricePct: number;
  /** Variación % de unidades vendidas. */
  volumePct: number;
  /** Variación % del costo unitario. */
  unitCostPct: number;
  /** Días de cobro a restar (negativo = cobrar más rápido). */
  dsoDeltaDays: number;
  /** Días de inventario a restar. */
  dioDeltaDays: number;
  /** Días de pago a sumar. */
  dpoDeltaDays: number;
}

export const NEUTRAL_LEVERS: SimulatorLevers = { pricePct: 0, volumePct: 0, unitCostPct: 0, dsoDeltaDays: 0, dioDeltaDays: 0, dpoDeltaDays: 0 };

export interface SimulatorResult {
  netSales: number;
  costOfSales: number;
  grossProfit: number;
  grossMarginPct: number | null;
  deltaGrossProfit: number;
  /** Caja liberada (+) o inmovilizada (−) por cambios en días de capital de trabajo. */
  cashFromWorkingCapital: number;
  /** Variación de las unidades necesaria para mantener la utilidad bruta si solo cambia el precio. */
  breakEvenVolumePct: number | null;
}

export function simulate(baseline: SimulatorBaseline, levers: SimulatorLevers): SimulatorResult {
  const priceFactor = 1 + levers.pricePct / 100;
  const volumeFactor = 1 + levers.volumePct / 100;
  const costFactor = 1 + levers.unitCostPct / 100;

  const netSales = Math.round(baseline.netSales * priceFactor * volumeFactor);
  const costOfSales = Math.round(baseline.costOfSales * volumeFactor * costFactor);
  const grossProfit = netSales - costOfSales;
  const baseProfit = baseline.netSales - baseline.costOfSales;

  // Unidades que harían falta, al nuevo precio y costo, para igualar la
  // utilidad bruta actual: contribución por "unidad de venta" antes y después.
  const newUnitContribution = priceFactor - (baseline.netSales === 0 ? 0 : (baseline.costOfSales / baseline.netSales) * costFactor);
  const baseUnitContribution = baseline.netSales === 0 ? 0 : 1 - baseline.costOfSales / baseline.netSales;
  const breakEvenVolumePct =
    newUnitContribution > 0 && baseUnitContribution > 0 ? (baseUnitContribution / newUnitContribution - 1) * 100 : null;

  const scaledSalesGross = baseline.salesGross * priceFactor * volumeFactor;
  const scaledCost = baseline.costOfSales * volumeFactor * costFactor;
  const scaledPurchases = baseline.purchasesGross * volumeFactor * costFactor;

  return {
    netSales,
    costOfSales,
    grossProfit,
    grossMarginPct: netSales === 0 ? null : (grossProfit / netSales) * 100,
    deltaGrossProfit: grossProfit - baseProfit,
    cashFromWorkingCapital: workingCapitalImpact(
      { salesGross: scaledSalesGross, costOfSales: scaledCost, purchasesGross: scaledPurchases },
      { dso: levers.dsoDeltaDays, dio: levers.dioDeltaDays, dpo: levers.dpoDeltaDays }
    ),
    breakEvenVolumePct,
  };
}

import { calculateGrossPrice, calculateNeto } from '@/lib/chile/tax';
import { computeDocument } from '@/modules/sales/calc';

/**
 * Precio de un pedido de la tienda. El TOTAL es exactamente el del documento de venta
 * que se emite al cobrar: se calcula con `computeDocument` (IVA redondeado una sola
 * vez sobre el neto del conjunto y repartido por resto mayor), el mismo que usa
 * Ventas y el POS. Así la pasarela cobra lo mismo que registra la contabilidad: ni un
 * peso de diferencia.
 *
 * Lo que VE el comprador es lo natural: precio con IVA × unidades por línea y el
 * despacho tal como lo configuró la empresa. Como el IVA se redondea sobre el
 * conjunto, la suma de eso puede diferir del total en un peso; esa diferencia sale
 * como «Ajuste por redondeo» (casi siempre 0) en vez de esconderse dentro de una línea.
 *
 * El neto sale del catálogo (`Product.netPrice`). El despacho se cobra con IVA
 * incluido y viaja al documento como una línea de servicio afecta; como es la única
 * línea que no es un precio de catálogo, su neto se elige (dentro de ±3 pesos del
 * que sale de dividir por 1,19) para que el total del documento calce con lo que ve
 * el comprador. Sin despacho (retiro) no hay dónde absorber el redondeo y, si el IVA
 * del conjunto no calza con el de cada línea, la diferencia se informa.
 */

export interface PricedLineInput {
  productId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  unit: string;
  isExempt: boolean;
  /** Precio neto unitario del catálogo. */
  netUnit: number;
  quantity: number;
}

export interface PricedLine extends PricedLineInput {
  /** Precio unitario con IVA que ve el comprador. */
  grossUnit: number;
  /** Lo que ve el comprador en la línea: precio con IVA × unidades. */
  displayTotal: number;
  /** Valores contables de la línea (los del documento de venta). */
  subtotal: number;
  iva: number;
  total: number;
}

export interface OrderPricing {
  lines: PricedLine[];
  /** Productos con IVA (suma de lo que ve el comprador en cada línea). */
  subtotal: number;
  /** Despacho con IVA, tal como lo configuró la empresa; 0 si es retiro o es gratis. */
  shippingTotal: number;
  /** Diferencia de redondeo entre lo que se ve y el total contable (casi siempre 0). */
  rounding: number;
  /** Lo que se cobra: el total del documento de venta. */
  total: number;
  netAmount: number;
  exemptAmount: number;
  ivaAmount: number;
  /** Neto del despacho en el documento (0 si no hay). */
  shippingNet: number;
}

/** Variaciones del neto del despacho que se prueban, de la más cercana a la más lejana de `gross / 1,19`. */
const SHIPPING_NET_NUDGES = [0, -1, 1, -2, 2, -3, 3] as const;

function documentFor(lines: readonly PricedLineInput[], shippingNet: number) {
  return computeDocument([
    ...lines.map((line) => ({ unitPrice: line.netUnit, quantity: line.quantity, isExempt: line.isExempt })),
    ...(shippingNet > 0 ? [{ unitPrice: shippingNet, quantity: 1, isExempt: false }] : []),
  ]);
}

export function priceOrder(lines: readonly PricedLineInput[], shippingGross: number): OrderPricing {
  const displayedProducts = lines.reduce((sum, line) => sum + calculateGrossPrice(line.netUnit, line.isExempt) * line.quantity, 0);
  const target = displayedProducts + Math.max(0, shippingGross);

  let shippingNet = 0;
  let chosen = documentFor(lines, 0);
  if (shippingGross > 0) {
    const base = calculateNeto(shippingGross);
    let bestGap = Number.POSITIVE_INFINITY;
    for (const nudge of SHIPPING_NET_NUDGES) {
      const candidate = Math.max(1, base + nudge);
      const attempt = documentFor(lines, candidate);
      const gap = Math.abs(attempt.totals.totalAmount - target);
      if (gap < bestGap) {
        bestGap = gap;
        shippingNet = candidate;
        chosen = attempt;
      }
      if (gap === 0) break;
    }
  }
  const { items, totals } = chosen;

  const priced: PricedLine[] = lines.map((line, index) => {
    const grossUnit = calculateGrossPrice(line.netUnit, line.isExempt);
    return {
      ...line,
      grossUnit,
      displayTotal: grossUnit * line.quantity,
      subtotal: items[index]!.subtotal,
      iva: items[index]!.iva,
      total: items[index]!.total,
    };
  });
  const subtotal = priced.reduce((sum, line) => sum + line.displayTotal, 0);

  return {
    lines: priced,
    subtotal,
    shippingTotal: shippingGross > 0 ? shippingGross : 0,
    rounding: totals.totalAmount - subtotal - (shippingGross > 0 ? shippingGross : 0),
    total: totals.totalAmount,
    netAmount: totals.netAmount,
    exemptAmount: totals.exemptAmount,
    ivaAmount: totals.ivaAmount,
    shippingNet,
  };
}

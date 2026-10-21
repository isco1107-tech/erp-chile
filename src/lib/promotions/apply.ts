import type { CatalogLot } from './types';
import { isValidPercentBps } from './validate';

/**
 * Cómo se expresa la promoción en el documento (decisión, compatible con
 * `computeDocument` de src/modules/sales/calc.ts):
 *
 *  - La línea conserva su `unitPrice` ORIGINAL y lleva `discountPercent`
 *    = `percentBps / 100` (calc.ts trabaja con porcentaje, no con puntos base).
 *    `computeLineSubtotal` redondea una sola vez sobre el neto de la línea
 *    (`round(unitPrice * qty * (1 - pct/100))`), el IVA se reparte después por
 *    resto mayor y el total del documento sigue cuadrando. Rebajar el
 *    `unitPrice` en cambio redondearía el unitario y luego multiplicaría por la
 *    cantidad, arrastrando el error ($1 por unidad x 50 unidades) y perdiendo la
 *    traza del precio original.
 *  - `discountedUnitPrice` es solo para mostrar (etiqueta, ticket, POS): el
 *    unitario con descuento, entero, con `Math.round`. El neto que se cobra lo
 *    calcula calc.ts sobre la línea, no este valor.
 */
export interface AppliedPrice {
  originalPrice: number;
  /** Promoción elegida; `null` si ninguna aplica. */
  promotionId: string | null;
  percentBps: number;
  /** Valor para `LineItemInput.discountPercent` (0 si no hay promoción). */
  discountPercent: number;
  /** Unitario neto con descuento, entero CLP. Nunca negativo ni sobre `originalPrice`. */
  discountedUnitPrice: number;
  discountPerUnit: number;
}

export interface PromotionCandidate {
  id: string;
  percentBps: number;
}

/**
 * Elige UNA promoción: la de mayor descuento (sin apilar). Ignora
 * porcentajes inválidos o en 0. Empate: el id menor, para que el resultado sea
 * determinista.
 */
export function pickBestPromotion(candidates: readonly PromotionCandidate[]): PromotionCandidate | null {
  let best: PromotionCandidate | null = null;
  for (const c of candidates) {
    if (!isValidPercentBps(c.percentBps) || c.percentBps === 0) continue;
    if (!best || c.percentBps > best.percentBps || (c.percentBps === best.percentBps && c.id < best.id)) best = c;
  }
  return best;
}

/** Precio unitario neto con `percentBps` de descuento, entero CLP (`Math.round`). */
export function discountedPrice(netPrice: number, percentBps: number): number {
  if (!Number.isFinite(netPrice) || netPrice <= 0) return 0;
  if (!isValidPercentBps(percentBps)) return netPrice;
  const price = Math.round((netPrice * (10_000 - percentBps)) / 10_000);
  return Math.min(Math.max(price, 0), netPrice);
}

/**
 * Aplica la mejor de las promociones aplicables a un precio neto unitario.
 * Un precio no entero o no positivo vuelve sin descuento (no se inventa nada).
 */
export function applyBestPromotion(netPrice: number, candidates: readonly PromotionCandidate[]): AppliedPrice {
  const none: AppliedPrice = {
    originalPrice: netPrice,
    promotionId: null,
    percentBps: 0,
    discountPercent: 0,
    discountedUnitPrice: netPrice,
    discountPerUnit: 0,
  };
  if (!Number.isInteger(netPrice) || netPrice <= 0) return none;
  const best = pickBestPromotion(candidates);
  if (!best) return none;
  const discountedUnitPrice = discountedPrice(netPrice, best.percentBps);
  return {
    originalPrice: netPrice,
    promotionId: best.id,
    percentBps: best.percentBps,
    discountPercent: best.percentBps / 100,
    discountedUnitPrice,
    discountPerUnit: netPrice - discountedUnitPrice,
  };
}

export interface LotSplit {
  /** Unidades que salen de lotes con promoción. */
  discounted: number;
  /** Unidades que salen de lotes sin promoción (o sin lote asignable). */
  full: number;
}

/**
 * Cuando la promoción cubre solo algunos lotes (`wholeProduct: false`), una
 * venta consume primero el lote que vence antes (FEFO) y la línea debe partirse
 * en una parte con descuento y otra sin él. Lo que excede el stock de los lotes
 * conocidos cuenta como sin descuento.
 */
export function splitQuantityByLots(lots: readonly CatalogLot[], promotedLotNumbers: readonly string[], quantity: number): LotSplit {
  const ordered = lots
    .filter((l) => l.quantity > 0)
    .map((lot, index) => ({ lot, index }))
    .sort((a, b) => {
      const ea = a.lot.expiresAt?.getTime();
      const eb = b.lot.expiresAt?.getTime();
      if (ea !== undefined && eb !== undefined) return ea - eb || a.index - b.index;
      if (ea !== undefined) return -1;
      if (eb !== undefined) return 1;
      return a.index - b.index;
    });
  let remaining = Math.max(0, quantity);
  let discounted = 0;
  for (const { lot } of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    if (promotedLotNumbers.includes(lot.lotNumber)) discounted += take;
    remaining -= take;
  }
  const total = Math.max(0, quantity);
  return { discounted, full: total - discounted };
}

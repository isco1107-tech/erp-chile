import { commissionOf, effectiveCommissionBps, isValidCommissionBps } from './commission';

/**
 * Costo "de gestión" de la mercadería de un seller, para reportes y márgenes. En el libro contable un
 * producto de seller no tiene costo (no es tuyo hasta que se vende), pero para saber cuánto ganas de
 * verdad por venderlo, lo que se le debe al seller es el costo: tu margen es la comisión.
 */

/** Costo de una línea vendida: lo que se le debe al seller si era suyo, y el PMP si era propia. */
export function lineCostForMargin(item: {
  quantity: number;
  subtotal: number;
  unitCostPMP: number;
  consignorId: string | null;
  consignorCommissionBps: number | null;
}): number {
  if (item.consignorId && isValidCommissionBps(item.consignorCommissionBps)) {
    return item.subtotal - commissionOf(item.subtotal, item.consignorCommissionBps);
  }
  return Math.round(item.unitCostPMP * item.quantity);
}

/**
 * Costo unitario de un producto del catálogo para comparar con su precio: el PMP si es propio, y lo que
 * se le pagaría al seller por una unidad (precio neto menos la comisión que rige) si es de un seller.
 * Un producto de seller sin comisión definida no inventa un costo: queda en su PMP (0).
 */
export function productCostForMargin(
  product: { costPricePMP: number; netPrice: number; consignorId: string | null; consignmentCommissionBps: number | null },
  sellerCommissionBps: number | null | undefined
): number {
  if (!product.consignorId) return product.costPricePMP;
  const bps = effectiveCommissionBps(product.consignmentCommissionBps, sellerCommissionBps);
  if (bps === null) return product.costPricePMP;
  return product.netPrice - commissionOf(product.netPrice, bps);
}

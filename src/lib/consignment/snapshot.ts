import { effectiveCommissionBps } from './commission';

/**
 * La foto que se guarda en cada línea de venta de un producto en consignación: de quién era y qué
 * comisión regía en ese momento. Con ella la liquidación no depende de cómo estén hoy el producto
 * ni el seller.
 */
export interface ConsignmentSnapshot {
  consignorId: string;
  commissionBps: number;
}

/**
 * Foto para una venta nueva: el dueño del producto y su comisión (la del producto o, si no tiene,
 * la del seller). Si no hay comisión no se vende en silencio: una línea sin comisión congelada
 * nunca se liquidaría.
 */
export function snapshotForProduct(
  product: { name: string; consignorId: string; consignmentCommissionBps: number | null },
  sellerCommissionBps: number | null | undefined
): ConsignmentSnapshot {
  const commissionBps = effectiveCommissionBps(product.consignmentCommissionBps, sellerCommissionBps);
  if (commissionBps === null) {
    throw new Error(`"${product.name}" está en consignación pero no tiene comisión definida: indícala en el producto o en la ficha del seller antes de venderlo`);
  }
  return { consignorId: product.consignorId, commissionBps };
}

/**
 * Foto para una devolución (Nota de Crédito): la de la línea que se devuelve, nunca la de hoy.
 * Si la venta original no era de un seller (se vendió antes de que el producto pasara a
 * consignación) la devolución tampoco descuenta nada al seller.
 */
export function snapshotsFromReferencedItems(
  items: ReadonlyArray<{ productId: string | null; consignorId: string | null; consignorCommissionBps: number | null }>
): Map<string, ConsignmentSnapshot> {
  const map = new Map<string, ConsignmentSnapshot>();
  for (const item of items) {
    if (!item.productId || !item.consignorId || item.consignorCommissionBps === null) continue;
    if (!map.has(item.productId)) map.set(item.productId, { consignorId: item.consignorId, commissionBps: item.consignorCommissionBps });
  }
  return map;
}

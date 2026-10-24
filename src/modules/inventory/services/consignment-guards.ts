import type { Prisma } from '@prisma/client';

/**
 * Guardas de la mercadería de un seller para los flujos que NO la manejan: producción, importación
 * histórica, devoluciones a proveedor. La mercadería de un seller no se compra, no se produce ni se
 * consume, y solo sale del kardex por una venta, una devolución al seller o un ajuste.
 */

/** Rechaza si alguno de los productos es mercadería de un seller (`what` completa «… no se puede usar en {what}»). */
export async function assertProductsNotConsigned(
  db: Pick<Prisma.TransactionClient, 'product'>,
  companyId: string,
  productIds: ReadonlyArray<string | null | undefined>,
  what: string
): Promise<void> {
  const ids = [...new Set(productIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const consigned = await db.product.findMany({ where: { companyId, id: { in: ids }, consignorId: { not: null } }, select: { name: true }, take: 3 });
  if (consigned.length === 0) return;
  const names = consigned.map((product) => `"${product.name}"`).join(', ');
  throw new Error(`${names} ${consigned.length === 1 ? 'está' : 'están'} en consignación (mercadería de un seller) y no se puede usar en ${what}.`);
}

/**
 * Una devolución o anulación que repone stock solo es coherente si el producto sigue teniendo el mismo
 * dueño que cuando se vendió: si pasó de propio a seller (o al revés, o a otro seller), reponer desde ese
 * documento mezclaría la mercadería de uno con la de otro y descuadraría el libro contra el kardex.
 */
export function assertSameOwnerSinceSale(product: { name: string }, productConsignorId: string | null, saleConsignorId: string | null, action: string): void {
  if ((productConsignorId ?? null) === (saleConsignorId ?? null)) return;
  throw new Error(
    `No se puede ${action} "${product.name}" desde este documento: el producto cambió de dueño (propio o de un seller) desde la venta. Registra un ajuste de stock y, si corresponde, una nota de crédito sin devolución de mercadería.`
  );
}

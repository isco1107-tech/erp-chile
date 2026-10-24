import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { availableUnits } from '@/lib/ecommerce/availability';
import { getReservedStock } from '@/modules/sales/services/sales-orders.service';
import { OutOfStockError, type StockShortage } from '../errors';

/**
 * Stock de la tienda: lo que se puede vender por internet es el stock físico de la
 * bodega de la tienda MENOS las reservas vigentes (pedidos que se están pagando o ya
 * pagados sin emitir) y lo comprometido en notas de venta abiertas. La reserva se toma
 * con el lock de la fila de stock en la misma transacción que crea el pedido: dos
 * compradores del último producto no pasan los dos.
 *
 * Un producto sin control de stock (`isTrackable: false`, p. ej. un servicio) nunca
 * se reserva ni se agota.
 */

type Tx = Prisma.TransactionClient;

export interface ProductAvailability {
  productId: string;
  trackable: boolean;
  onHand: number;
  reservedByStore: number;
  committed: number;
  /** `null` = sin control de stock (siempre disponible). */
  available: number | null;
}

/** Reservas que cuentan: activas y, si vencen, que aún no vencieron. */
function liveReservation(now: Date): Prisma.StoreStockReservationWhereInput {
  return { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

async function reservedByStore(client: Tx | typeof prisma, companyId: string, warehouseId: string, productIds: string[], now: Date): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const rows = await client.storeStockReservation.groupBy({
    by: ['productId'],
    where: { companyId, warehouseId, productId: { in: productIds }, ...liveReservation(now) },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.productId, row._sum.quantity ?? 0]));
}

/**
 * Disponibilidad de un conjunto de productos en la bodega de la tienda. Se puede
 * llamar con la transacción del checkout (después de tomar el lock) o suelto para mostrar.
 */
export async function getAvailability(
  companyId: string,
  warehouseId: string,
  productIds: string[],
  options: { client?: Tx; now?: Date } = {}
): Promise<Map<string, ProductAvailability>> {
  const client = options.client ?? prisma;
  const now = options.now ?? new Date();
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();

  const [products, stocks, reserved, committed] = await Promise.all([
    client.product.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, isTrackable: true } }),
    client.stock.findMany({ where: { companyId, warehouseId, productId: { in: ids } }, select: { productId: true, quantity: true } }),
    reservedByStore(client, companyId, warehouseId, ids, now),
    getReservedStock(companyId, ids, warehouseId, client),
  ]);
  const onHandBy = new Map(stocks.map((row) => [row.productId, row.quantity]));

  return new Map(
    products.map((product) => {
      const onHand = onHandBy.get(product.id) ?? 0;
      const reservedUnits = reserved.get(product.id) ?? 0;
      const committedUnits = committed.get(product.id) ?? 0;
      return [
        product.id,
        {
          productId: product.id,
          trackable: product.isTrackable,
          onHand,
          reservedByStore: reservedUnits,
          committed: committedUnits,
          available: product.isTrackable ? availableUnits({ onHand, reservedByStore: reservedUnits, committedBySalesOrders: committedUnits }) : null,
        },
      ];
    })
  );
}

/**
 * Toma el lock de las filas de stock de los productos (orden fijo por producto, para no
 * cruzar locks entre pedidos) y devuelve cuántas unidades tiene cada uno. Un producto sin
 * fila de stock no tiene unidades.
 */
export async function lockStockRows(tx: Tx, companyId: string, warehouseId: string, productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  const ordered = [...new Set(productIds)].sort();
  await tx.$queryRaw`SELECT id FROM "Stock" WHERE "companyId" = ${companyId} AND "warehouseId" = ${warehouseId} AND "productId" = ANY(${ordered}) ORDER BY "productId" FOR UPDATE`;
}

export interface ReserveLine {
  productId: string;
  name: string;
  quantity: number;
}

/**
 * Aparta las unidades de un pedido. Va DENTRO de la transacción que crea el pedido:
 * toma el lock de stock, revisa la disponibilidad real y, si todo alcanza, deja las
 * reservas; si algo no alcanza lanza `OutOfStockError` con el detalle y no queda nada.
 */
export async function reserveForOrder(
  tx: Tx,
  params: { companyId: string; warehouseId: string; orderId: string; lines: ReserveLine[]; expiresAt: Date; now?: Date }
): Promise<void> {
  const { companyId, warehouseId, orderId, lines, expiresAt } = params;
  const now = params.now ?? new Date();
  const productIds = lines.map((line) => line.productId);

  await lockStockRows(tx, companyId, warehouseId, productIds);
  const availability = await getAvailability(companyId, warehouseId, productIds, { client: tx, now });

  const shortages: StockShortage[] = [];
  const toReserve: ReserveLine[] = [];
  for (const line of lines) {
    const info = availability.get(line.productId);
    if (!info) {
      shortages.push({ productId: line.productId, name: line.name, requested: line.quantity, available: 0 });
      continue;
    }
    if (info.available === null) continue; // sin control de stock
    if (line.quantity > info.available) shortages.push({ productId: line.productId, name: line.name, requested: line.quantity, available: info.available });
    else toReserve.push(line);
  }
  if (shortages.length > 0) throw new OutOfStockError(shortages);

  if (toReserve.length > 0) {
    await tx.storeStockReservation.createMany({
      data: toReserve.map((line) => ({ companyId, orderId, productId: line.productId, warehouseId, quantity: line.quantity, status: 'ACTIVE' as const, expiresAt })),
    });
  }
}

/** Cierra las reservas activas de un pedido: liberadas (pedido vencido o cancelado) o consumidas (la venta ya descontó el stock). */
export async function closeReservations(tx: Tx, companyId: string, orderId: string, status: 'RELEASED' | 'CONSUMED'): Promise<number> {
  const result = await tx.storeStockReservation.updateMany({ where: { companyId, orderId, status: 'ACTIVE' }, data: { status, expiresAt: null } });
  return result.count;
}

/** Quita el vencimiento de las reservas de un pedido ya pagado: se mantienen hasta emitir la venta o cancelar. */
export async function holdReservations(tx: Tx, companyId: string, orderId: string): Promise<void> {
  await tx.storeStockReservation.updateMany({ where: { companyId, orderId, status: 'ACTIVE' }, data: { expiresAt: null } });
}

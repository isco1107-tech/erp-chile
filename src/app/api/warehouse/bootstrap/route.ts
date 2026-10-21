import { cookies } from 'next/headers';
import { Prisma } from '@prisma/client';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { verifySessionToken } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { OFFLINE_SESSION_MS, WAREHOUSE_PROTOCOL } from '@/lib/warehouse/contracts';
import { warehouseJson, warehouseFailure, assertWarehouseRate } from '@/modules/inventory/warehouse-http';

export async function GET(request: Request) {
  try {
    const context = await requireAuthWithPermission('products:read');
    assertWarehouseRate(context.id, 'catalog');
    const token = (await cookies()).get('session')?.value;
    const payload = await verifySessionToken(token ?? '');
    const now = Date.now();
    const query = new URL(request.url).searchParams;
    const cursor = query.get('cursor');
    const identity = {
      companyId: context.companyId, companyName: context.companyName, userId: context.id, userName: context.name,
      serverTime: new Date(now).toISOString(), offlineUntil: new Date(Math.min((payload.exp ?? 0) * 1000, now + OFFLINE_SESSION_MS)).toISOString(),
      canOperate: context.permissions.includes('inventory:operate'), canApprove: context.permissions.includes('inventory:approve'), canReceive: context.permissions.includes('purchases:orders'),
    };
    if (query.get('identityOnly') === '1') return warehouseJson({ protocol: WAREHOUSE_PROTOCOL, identity, products: [], warehouses: [], orders: [], nextCursor: null });
    const ids = query.has('ids') ? query.get('ids')!.split(',') : null;
    if (ids && (ids.length > 100 || ids.some((id) => !/^[a-zA-Z0-9_-]{1,100}$/.test(id)))) return warehouseJson({ error: 'Selección de productos inválida' }, 400);
    if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) return warehouseJson({ error: 'Cursor inválido' }, 400);
    const data = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { companyId: context.companyId, isTrackable: true, ...(ids ? { id: { in: ids } } : cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 201,
        select: {
          id: true, sku: true, name: true, barcode: true, unit: true, tracksLots: true,
          packagings: { where: { companyId: context.companyId }, select: { id: true, name: true, barcode: true, factor: true } },
          stocks: { where: { companyId: context.companyId }, select: { warehouseId: true, quantity: true, updatedAt: true } },
          lots: { where: { companyId: context.companyId }, select: { warehouseId: true, lotNumber: true, expiryDate: true, quantity: true, updatedAt: true } },
        },
      });
      const selected = products.slice(0, 200);
      const orders = context.permissions.includes('purchases:orders') ? await tx.purchaseOrder.findMany({
        where: { companyId: context.companyId, status: { in: ['SENT', 'PARTIALLY_RECEIVED'] }, items: { some: { companyId: context.companyId, productId: { in: selected.map((product) => product.id) } } } }, orderBy: { createdAt: 'desc' },
        select: { id: true, folio: true, contact: { select: { razonSocial: true } }, items: { where: { companyId: context.companyId, productId: { in: selected.map((product) => product.id) } }, select: { id: true, productId: true, description: true, quantity: true, receivedQuantity: true } } },
      }) : [];
      const warehouses = await tx.warehouse.findMany({ where: { companyId: context.companyId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }], select: { id: true, name: true, isDefault: true } });
      return { products: selected, nextCursor: products.length > 200 ? selected[selected.length - 1].id : null, warehouses, orders: orders.map((order) => ({ id: order.id, folio: order.folio, supplier: order.contact.razonSocial, items: order.items.flatMap((item) => item.productId && item.quantity - item.receivedQuantity > 1e-6 ? [{ id: item.id, productId: item.productId, description: item.description, remaining: item.quantity - item.receivedQuantity }] : []) })).filter((order) => order.items.length > 0) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
    return warehouseJson({ protocol: WAREHOUSE_PROTOCOL, ...data, identity });
  } catch (error) { return warehouseFailure(error); }
}

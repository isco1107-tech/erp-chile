import { requireAuthWithPermission } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { warehouseOperationSchema } from '@/lib/warehouse/contracts';
import { warehouseFailure, warehouseJson } from '@/modules/inventory/warehouse-http';

export async function GET(request: Request) {
  try {
    const context = await requireAuthWithPermission('inventory:approve');
    const cursor = new URL(request.url).searchParams.get('cursor');
    const history = new URL(request.url).searchParams.get('history') === '1';
    const rows = await prisma.warehouseOperation.findMany({ where: { companyId: context.companyId, ...(!history ? { status: { in: ['REVIEW', 'CONFLICT'] } } : {}), ...(cursor ? { id: { gt: cursor.slice(0, 100) } } : {}) }, orderBy: { id: 'asc' }, take: 51 });
    const selected = rows.slice(0, 50);
    const operations = selected.map((row) => ({ id: row.operationId, payload: warehouseOperationSchema.parse(row.payload), status: row.status, message: row.message, createdById: row.createdById, createdAt: row.createdAt.toISOString() }));
    const ids = operations.map((row) => row.payload.productId);
    const [products, warehouses, users] = await Promise.all([
      prisma.product.findMany({ where: { companyId: context.companyId, id: { in: ids } }, select: { id: true, name: true, sku: true, unit: true } }),
      prisma.warehouse.findMany({ where: { companyId: context.companyId }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { companyId: context.companyId, id: { in: selected.map((row) => row.createdById) } }, select: { id: true, name: true } }),
    ]);
    return warehouseJson({ operations, products, warehouses, users, nextCursor: rows.length > 50 ? selected[selected.length - 1].id : null });
  } catch (error) { return warehouseFailure(error); }
}

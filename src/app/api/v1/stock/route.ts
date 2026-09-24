import { prisma } from '@/lib/prisma';
import { apiError, apiOk, authenticateApiRequest, pagination, type ApiContext } from '@/lib/api/public-api';

export const dynamic = 'force-dynamic';

/** Stock por producto y bodega. Filtros: `?sku=`, `?warehouseId=`. */
export async function GET(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'stock:read');
    const url = new URL(req.url);
    const { skip, take, page, pageSize } = pagination(url);
    const sku = url.searchParams.get('sku')?.trim();
    const warehouseId = url.searchParams.get('warehouseId')?.trim();
    const where = { companyId: ctx.companyId, ...(warehouseId ? { warehouseId } : {}), ...(sku ? { product: { sku } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.stock.findMany({
        where,
        skip,
        take,
        orderBy: { product: { name: 'asc' } },
        select: { quantity: true, product: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, name: true } } },
      }),
      prisma.stock.count({ where }),
    ]);
    return apiOk(
      rows.map((row) => ({ productId: row.product.id, sku: row.product.sku, name: row.product.name, warehouseId: row.warehouse.id, warehouse: row.warehouse.name, quantity: row.quantity })),
      { meta: { page, pageSize, total } }
    );
  } catch (error) {
    return apiError(error, { route: 'GET /api/v1/stock', companyId: ctx?.companyId });
  }
}

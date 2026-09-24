import { prisma } from '@/lib/prisma';
import { apiError, apiOk, authenticateApiRequest, pagination, type ApiContext } from '@/lib/api/public-api';

export const dynamic = 'force-dynamic';

/** Catálogo con precios de venta. El costo (PMP) NO sale por la API: es dato interno. */
export async function GET(req: Request) {
  let ctx: ApiContext | undefined;
  try {
    ctx = await authenticateApiRequest(req, 'products:read');
    const url = new URL(req.url);
    const { skip, take, page, pageSize } = pagination(url);
    const search = url.searchParams.get('search')?.trim();
    const sku = url.searchParams.get('sku')?.trim();
    const where = {
      companyId: ctx.companyId,
      ...(sku ? { sku } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { sku: { contains: search, mode: 'insensitive' as const } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        select: { id: true, sku: true, name: true, description: true, unit: true, netPrice: true, grossPrice: true, isExempt: true, isTrackable: true, category: { select: { name: true } }, updatedAt: true },
      }),
      prisma.product.count({ where }),
    ]);
    return apiOk(
      rows.map(({ category, ...product }) => ({ ...product, category: category?.name ?? null })),
      { meta: { page, pageSize, total } }
    );
  } catch (error) {
    return apiError(error, { route: 'GET /api/v1/products', companyId: ctx?.companyId });
  }
}

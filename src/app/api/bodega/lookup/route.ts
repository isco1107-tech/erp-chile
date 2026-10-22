import { WAREHOUSE_LOOKUP_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { fail, ok, withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { lookupQuerySchema } from '@/modules/warehouse-mobile/schema';
import { findByCode, searchProducts } from '@/modules/warehouse-mobile/services/catalog.service';
import type { LookupResponse } from '@/modules/warehouse-mobile/types';

/**
 * Búsqueda por código (lector o cámara) o por texto (buscador). No usa IA y
 * nunca devuelve costos ni precios.
 */
export async function GET(req: Request) {
  return withBodegaAuth({ permission: 'products:read', limit: WAREHOUSE_LOOKUP_RATE_LIMIT }, async (context) => {
    const url = new URL(req.url);
    const parsed = lookupQuerySchema.safeParse({
      code: url.searchParams.get('code') ?? undefined,
      q: url.searchParams.get('q') ?? undefined,
      warehouseId: url.searchParams.get('warehouseId') ?? undefined,
    });
    if (!parsed.success || (!parsed.data.code && !parsed.data.q)) return fail('Indica un código o un texto para buscar', 400);

    const { code, q, warehouseId } = parsed.data;
    const data: LookupResponse = {
      match: code ? await findByCode(context.companyId, code, warehouseId) : null,
      results: !code && q ? await searchProducts(context.companyId, q, warehouseId) : [],
    };
    return ok(data, { headers: { 'Cache-Control': 'private, no-store' } });
  });
}

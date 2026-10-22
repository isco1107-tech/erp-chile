import { ok, withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { listRecentOps } from '@/modules/warehouse-mobile/services/recent.service';

/** Historial reciente de quien usa la app (solo sus propios movimientos). */
export async function GET() {
  return withBodegaAuth({ permission: 'products:read' }, async (context) => {
    return ok(await listRecentOps(context.companyId, context.id), { headers: { 'Cache-Control': 'private, no-store' } });
  });
}

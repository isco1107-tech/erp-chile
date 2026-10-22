import { revalidatePath } from 'next/cache';
import { can } from '@/lib/auth/guards';
import { WAREHOUSE_SYNC_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { fail, ok, withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { syncRequestSchema } from '@/modules/warehouse-mobile/schema';
import { processOperations } from '@/modules/warehouse-mobile/services/sync.service';
import type { SyncResponse } from '@/modules/warehouse-mobile/types';

/**
 * Recibe la cola de movimientos del celular. Cada operación lleva su propia
 * clave, así que reenviar el mismo envío (respuesta perdida, señal intermitente)
 * es seguro: lo ya aplicado se responde igual sin mover el stock otra vez.
 */
export const maxDuration = 60;

/** Un envío normal pesa pocos KB; esto corta cuerpos absurdos antes de leerlos. */
const MAX_BODY_BYTES = 256_000;

export async function POST(req: Request) {
  return withBodegaAuth({ permission: 'inventory:write', limit: WAREHOUSE_SYNC_RATE_LIMIT }, async (context) => {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail('El envío es demasiado grande', 413);

    const body: unknown = await req.json().catch(() => null);
    const parsed = syncRequestSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Envío inválido', 400);

    const results = await processOperations(
      {
        companyId: context.companyId,
        userId: context.id,
        userEmail: context.email,
        canMove: can(context, 'inventory:write'),
        canCreateProduct: can(context, 'products:write'),
        canSeeCosts: can(context, 'products:costs'),
      },
      parsed.data.ops
    );

    if (results.some((result) => result.status === 'APPLIED' && !result.replayed)) {
      revalidatePath('/dashboard/inventory');
      revalidatePath('/dashboard/products');
    }
    const data: SyncResponse = { results };
    return ok(data, { headers: { 'Cache-Control': 'private, no-store' } });
  });
}

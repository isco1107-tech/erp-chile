import { WAREHOUSE_IDENTIFY_COMPANY_RATE_LIMIT, WAREHOUSE_IDENTIFY_RATE_LIMIT, checkRateLimit } from '@/lib/security/rate-limiter';
import { sniffImageType } from '@/lib/security/file-signature';
import { fail, ok, tooMany, withBodegaAuth } from '@/modules/warehouse-mobile/http';
import { MAX_PHOTO_BYTES } from '@/modules/warehouse-mobile/photo';
import { identifyPhoto } from '@/modules/warehouse-mobile/services/identify.service';
import { InvalidImageError } from '@/modules/warehouse-mobile/services/image.service';

/**
 * Identifica un producto a partir de una foto. Route Handler y no Server Action
 * por el tamaño del cuerpo y porque la app lo reintenta desde su cola.
 *
 * Responde 200 aunque la IA esté al tope (`status: 'busy'` + `retryAfterMs`):
 * "espera un momento" es una respuesta normal, no un error, y así la app no la
 * confunde con una caída. El control de cuota vive en `identify.service.ts`.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  return withBodegaAuth({ permission: 'products:read', limit: WAREHOUSE_IDENTIFY_RATE_LIMIT }, async (context) => {
    const companyLimit = checkRateLimit(context.companyId, WAREHOUSE_IDENTIFY_COMPANY_RATE_LIMIT);
    if (!companyLimit.allowed) return tooMany(companyLimit.retryAfterMs);

    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_PHOTO_BYTES + 50_000) return fail('La foto es demasiado grande', 413);

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) return fail('Adjunta una foto', 400);
    if (file.size > MAX_PHOTO_BYTES) return fail('La foto es demasiado grande', 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!sniffImageType(bytes)) return fail('La foto debe ser JPG, PNG o WEBP', 400);

    const warehouseId = form?.get('warehouseId');
    try {
      const result = await identifyPhoto({ companyId: context.companyId, userId: context.id }, bytes, typeof warehouseId === 'string' && warehouseId ? warehouseId : undefined);
      return ok(result, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (error instanceof InvalidImageError) return fail(error.message, 400);
      throw error;
    }
  });
}

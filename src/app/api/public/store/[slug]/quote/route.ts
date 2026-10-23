import { quoteSchema } from '@/lib/ecommerce/checkout';
import { STORE_QUOTE_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { jsonError, jsonOk, limitByIp, readJsonBody, storeErrorResponse } from '@/modules/ecommerce/public-api';
import { quoteCart, resolvePublicStore } from '@/modules/ecommerce/services/store-public.service';

export const dynamic = 'force-dynamic';

/**
 * Valoriza el carrito de una tienda (sin sesión). El navegador solo manda producto y cantidad
 * (y, si ya lo eligió, región, forma de entrega y tarifa): precio, stock, despacho y medios de
 * pago salen del servidor. La empresa sale del sitio, nunca del cuerpo.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const limited = limitByIp(req, STORE_QUOTE_RATE_LIMIT);
  if (limited) return limited;

  const read = await readJsonBody(req, 16 * 1024);
  if (!read.ok) return read.response;
  const parsed = quoteSchema.safeParse(read.body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Revisa tu carrito.', 400);

  try {
    const store = await resolvePublicStore(slug);
    if (!store) return jsonError('Esta tienda no está disponible.', 404);
    const quote = await quoteCart(store, parsed.data);
    return jsonOk(quote);
  } catch (error) {
    return storeErrorResponse(error, { reason: 'public-quote', fallback: 'No pudimos actualizar tu carrito. Intenta de nuevo.' });
  }
}

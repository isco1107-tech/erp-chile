import { checkoutSchema } from '@/lib/ecommerce/checkout';
import { STORE_CHECKOUT_RATE_LIMIT, STORE_CHECKOUT_SITE_RATE_LIMIT, checkRateLimit } from '@/lib/security/rate-limiter';
import { jsonError, jsonOk, limitByIp, readJsonBody, storeErrorResponse } from '@/modules/ecommerce/public-api';
import { createStoreOrder } from '@/modules/ecommerce/services/store-checkout.service';
import { countRecentOrders, resolvePublicStore } from '@/modules/ecommerce/services/store-public.service';

export const dynamic = 'force-dynamic';

/** Tope por tienda y por hora, contado en la base de datos: el límite en memoria no se comparte entre instancias serverless. */
const MAX_ORDERS_PER_SITE_PER_HOUR = 300;

/**
 * Crea el pedido de un comprador (sin sesión). Del cuerpo solo se toman productos, cantidades y
 * datos de contacto; el servidor vuelve a leer precios, stock, tarifas y medios de pago. La
 * respuesta dice a dónde seguir: la pasarela (`redirectUrl`) o la página del pedido
 * (`orderToken`), que el navegador arma bajo la dirección del sitio en que está.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const limited = limitByIp(req, STORE_CHECKOUT_RATE_LIMIT, 'Hiciste varios intentos de compra seguidos. Espera un rato e intenta de nuevo.');
  if (limited) return limited;

  const read = await readJsonBody(req, 16 * 1024);
  if (!read.ok) return read.response;

  // Señuelo: un bot completa el campo oculto. Se responde como si hubiera funcionado, sin crear nada.
  const body = read.body;
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).website === 'string' && (body as Record<string, string>).website !== '') {
    return jsonError('No pudimos procesar tu compra. Intenta de nuevo.', 400);
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return jsonError(issue?.message ?? 'Revisa los datos de tu compra.', 400, issue?.path[0] ? { field: String(issue.path[issue.path.length - 1]) } : {});
  }

  try {
    const store = await resolvePublicStore(slug);
    if (!store) return jsonError('Esta tienda no está disponible en este momento.', 404);

    const siteLimit = checkRateLimit(store.siteId, STORE_CHECKOUT_SITE_RATE_LIMIT);
    if (!siteLimit.allowed || (await countRecentOrders(store.companyId, store.siteId, 60)) >= MAX_ORDERS_PER_SITE_PER_HOUR) {
      return jsonError('Esta tienda está recibiendo muchos pedidos a la vez. Intenta de nuevo en unos minutos.', 429);
    }

    const created = await createStoreOrder(store, parsed.data);
    return jsonOk({ number: created.number, orderToken: created.accessToken, redirectUrl: created.redirectUrl, paymentProvider: created.paymentProvider, replayed: created.replayed });
  } catch (error) {
    return storeErrorResponse(error, { reason: 'public-checkout', fallback: 'No pudimos crear tu pedido. Intenta de nuevo en unos minutos.' });
  }
}

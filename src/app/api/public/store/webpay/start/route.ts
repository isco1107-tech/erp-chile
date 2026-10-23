import { NextResponse } from 'next/server';
import { webpayBridgeHtml } from '@/lib/ecommerce/webpay-bridge';
import { STORE_ORDER_RATE_LIMIT, checkRateLimit } from '@/lib/security/rate-limiter';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { captureException } from '@/lib/observability';
import { getWebpayBridge } from '@/modules/ecommerce/services/store-payment.service';

export const dynamic = 'force-dynamic';

/**
 * Puente hacia Webpay Plus: una página mínima con un formulario POST (`token_ws`) hacia el
 * sitio de Transbank que se envía solo. La CSP de esta ruta (next.config.js) permite enviar
 * formularios únicamente a los hosts de Transbank. El pedido se identifica con su enlace
 * secreto (`?o=`) y solo sirve mientras el cobro de Webpay siga pendiente.
 */
function page(message: string, status: number) {
  return new NextResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pago no disponible</title></head><body style="font-family:system-ui,sans-serif;max-width:24rem;margin:4rem auto;padding:0 1rem;text-align:center"><p>${message}</p></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

export async function GET(req: Request) {
  if (!checkRateLimit(extractClientIp(req) ?? 'unknown', STORE_ORDER_RATE_LIMIT).allowed) return page('Demasiados intentos. Espera unos minutos y vuelve a abrir el enlace de tu pedido.', 429);
  const token = new URL(req.url).searchParams.get('o') ?? '';
  try {
    const bridge = await getWebpayBridge(token);
    const html = bridge ? webpayBridgeHtml(bridge.url, bridge.token) : null;
    if (!html) return page('Este pago ya no está disponible. Vuelve al enlace de tu pedido para ver su estado.', 404);
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' } });
  } catch (error) {
    captureException(error, { module: 'tienda-en-linea', extra: { reason: 'webpay-start' } });
    return page('No pudimos abrir el pago. Intenta de nuevo en unos minutos.', 500);
  }
}

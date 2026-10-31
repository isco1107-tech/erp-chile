import { NextRequest, NextResponse } from 'next/server';
import { readHermesKey, hermesProductQuerySchema } from '@/lib/hermes/link';
import { listHermesProducts, resolveHermesLink } from '@/modules/hermes/services/hermes-link.service';
import { checkRateLimit, HERMES_LINK_IP_RATE_LIMIT, HERMES_LINK_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { captureException } from '@/lib/observability';

/**
 * Catálogo para la caja de Hermes: nombre, SKU, precio con IVA y stock de la bodega de la
 * conexión. Sin sesión a propósito (lo llama la API de Hermes): la autenticación es la llave
 * `Authorization: Bearer hk_…` de Configuración → Empresa → Conexión con Hermes, que además
 * identifica a la empresa. Nunca costos ni PMP.
 */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(getClientIp(req.headers) ?? 'desconocida', HERMES_LINK_IP_RATE_LIMIT).allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes: intenta en un momento' }, { status: 429 });
  }
  const key = readHermesKey(req.headers.get('authorization'));
  if (!key) return NextResponse.json({ error: 'Falta la llave de conexión con Hermes' }, { status: 401 });
  try {
    const ctx = await resolveHermesLink(key);
    if (!ctx) return NextResponse.json({ error: 'Llave inválida o empresa sin inventario activo' }, { status: 401 });
    const limit = checkRateLimit(ctx.companyId, HERMES_LINK_RATE_LIMIT);
    if (!limit.allowed) return NextResponse.json({ error: 'Demasiadas consultas: intenta en un momento' }, { status: 429 });
    const query = hermesProductQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!query.success) return NextResponse.json({ error: 'Búsqueda inválida' }, { status: 400 });
    const products = await listHermesProducts(ctx, query.data);
    return NextResponse.json({ products }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    captureException(error, { module: 'hermes', extra: { step: 'products' } });
    return NextResponse.json({ error: 'Error interno del ERP' }, { status: 500 });
  }
}

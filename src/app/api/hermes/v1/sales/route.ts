import { NextRequest, NextResponse } from 'next/server';
import { hermesSaleSchema, readHermesKey } from '@/lib/hermes/link';
import { createHermesSale, HermesLinkError, resolveHermesLink } from '@/modules/hermes/services/hermes-link.service';
import { checkRateLimit, HERMES_LINK_IP_RATE_LIMIT, HERMES_LINK_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { getClientIp } from '@/lib/security/cloudflare';
import { captureException } from '@/lib/observability';

const MAX_BODY_BYTES = 32 * 1024;

/**
 * Venta de productos desde la caja de Hermes: boleta por el mismo camino de la tienda en línea
 * (kardex al PMP, asiento y cobro en Tesorería). Del cuerpo solo viajan producto, cantidad, medio
 * de pago y la clave de idempotencia: precio e IVA salen del catálogo. Reenviar la misma clave
 * devuelve la misma boleta (`replayed: true`). La empresa sale de la llave, nunca del cuerpo.
 */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(getClientIp(req.headers) ?? 'desconocida', HERMES_LINK_IP_RATE_LIMIT).allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes: intenta en un momento' }, { status: 429 });
  }
  const key = readHermesKey(req.headers.get('authorization'));
  if (!key) return NextResponse.json({ error: 'Falta la llave de conexión con Hermes' }, { status: 401 });
  try {
    const ctx = await resolveHermesLink(key);
    if (!ctx) return NextResponse.json({ error: 'Llave inválida o empresa sin inventario activo' }, { status: 401 });
    const limit = checkRateLimit(ctx.companyId, HERMES_LINK_RATE_LIMIT);
    if (!limit.allowed) return NextResponse.json({ error: 'Demasiadas ventas seguidas: intenta en un momento' }, { status: 429 });
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Venta demasiado grande' }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
    }
    const input = hermesSaleSchema.safeParse(body);
    if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Venta inválida' }, { status: 400 });
    const sale = await createHermesSale(ctx, input.data);
    return NextResponse.json(sale, { status: sale.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof HermesLinkError) return NextResponse.json({ error: error.message }, { status: error.status });
    captureException(error, { module: 'hermes', extra: { step: 'sales' } });
    return NextResponse.json({ error: 'Error interno del ERP' }, { status: 500 });
  }
}

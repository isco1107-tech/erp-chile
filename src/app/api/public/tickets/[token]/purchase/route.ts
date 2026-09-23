import { NextResponse } from 'next/server';
import { publicTicketPurchaseSchema, TICKET_PURCHASE_HONEYPOT_FIELD } from '@/modules/ticketing/schema';
import {
  createPublicTicketOrder,
  TicketSalesNotFoundError,
  TicketTypeClosedError,
  TicketSoldOutError,
} from '@/modules/ticketing/services/ticketing.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, TICKET_PURCHASE_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';

/**
 * Endpoint público de compra de entradas: sin autenticación, resuelto por
 * `Project.ticketSalesToken`. Mismo patrón que
 * `app/api/public/candidates/[token]/apply/route.ts` (honeypot + rate limit +
 * Zod), pero como Route Handler JSON simple: a diferencia de la postulación
 * de candidatas, esta compra no sube archivos, así que no hace falta
 * `multipart/form-data` ni el límite de 1 MB de las Server Actions es un
 * problema — igual se mantiene como Route Handler por consistencia con el
 * resto de los endpoints públicos de este proyecto (todos bajo `/api/`).
 */

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, TICKET_PURCHASE_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.ceil((rl.retryAfterMs - Date.now()) / 1000) : 3600;
    return NextResponse.json(
      { success: false, error: 'Demasiadas compras desde esta conexión. Intenta de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('No se pudo leer la solicitud enviada', 400);
  }

  // Honeypot: mismo criterio que la postulación de candidatas — se descarta
  // en silencio con 200, sin dar pistas de que fue detectado.
  const honeypot = body[TICKET_PURCHASE_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ success: true, data: { orderId: 'OK' } });
  }

  const parsed = publicTicketPurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  try {
    const { sale, ticketTypeName } = await createPublicTicketOrder(token, parsed.data);
    return NextResponse.json({
      success: true,
      data: {
        orderId: sale.id,
        ticketTypeName,
        quantity: sale.quantity,
        totalAmount: sale.totalAmount,
      },
    });
  } catch (error) {
    if (error instanceof TicketSalesNotFoundError) return jsonError(error.message, 403);
    if (error instanceof TicketTypeClosedError) return jsonError(error.message, 403);
    if (error instanceof TicketSoldOutError) return jsonError(error.message, 409);
    captureException(error, { module: 'ticketing' });
    return jsonError('No se pudo procesar tu compra. Intenta de nuevo más tarde.', 500);
  }
}

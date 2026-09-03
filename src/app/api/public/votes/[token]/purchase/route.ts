import { NextResponse } from 'next/server';
import { publicVotePurchaseSchema, VOTE_PURCHASE_HONEYPOT_FIELD } from '@/modules/public-voting/schema';
import { createPublicVoteOrder, InvalidCandidateError, VoteSalesNotFoundError } from '@/modules/public-voting/services/public-voting.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, VOTE_PURCHASE_RATE_LIMIT } from '@/lib/security/rate-limiter';

/**
 * Endpoint público de compra de votos pagados: sin autenticación, resuelto
 * por `Project.voteSalesToken`. Mismo patrón que
 * `app/api/public/tickets/[token]/purchase/route.ts`.
 */

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, VOTE_PURCHASE_RATE_LIMIT);
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

  const honeypot = body[VOTE_PURCHASE_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ success: true, data: { orderId: 'OK' } });
  }

  const parsed = publicVotePurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  try {
    const { order, candidateName } = await createPublicVoteOrder(token, parsed.data);
    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        candidateName,
        voteCount: order.voteCount,
        totalAmount: order.totalAmount,
      },
    });
  } catch (error) {
    if (error instanceof VoteSalesNotFoundError) return jsonError(error.message, 403);
    if (error instanceof InvalidCandidateError) return jsonError(error.message, 400);
    console.error('vote-purchase: error inesperado:', error);
    return jsonError('No se pudo procesar tu compra. Intenta de nuevo más tarde.', 500);
  }
}

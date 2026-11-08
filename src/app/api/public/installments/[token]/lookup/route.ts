import { checkLayeredRateLimit } from '@/lib/security/durable-rate-limit';
import { NextResponse } from 'next/server';
import { publicInstallmentLookupSchema } from '@/modules/payment-plans/schema';
import { lookupPublicInstallments, PortalNotFoundError } from '@/modules/payment-plans/services/online-payment.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { INSTALLMENT_LOOKUP_RATE_LIMIT, INSTALLMENT_LOOKUP_RUT_RATE_LIMIT, INSTALLMENT_LOOKUP_TOKEN_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/security/turnstile';
import { cleanRut } from '@/lib/chile/rut';
import { captureException } from '@/lib/observability';

/**
 * Portal público de pago de cuotas — paso 1: consulta por RUT de la
 * candidata. Sin sesión: la empresa sale del token de la URL, nunca del body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const clientIp = extractClientIp(req);
  const rl = await checkLayeredRateLimit(clientIp ?? 'unknown', INSTALLMENT_LOOKUP_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.max(1, Math.ceil((rl.retryAfterMs - Date.now()) / 1000)) : 900;
    return NextResponse.json(
      { success: false, error: 'Demasiadas consultas desde esta conexión. Intenta de nuevo en unos minutos.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo leer la solicitud enviada' }, { status: 400 });
  }

  const human = await verifyTurnstile((body as Record<string, unknown> | null)?.[TURNSTILE_FIELD], clientIp, 'installment-lookup');
  if (!human.ok) return NextResponse.json({ success: false, error: human.error }, { status: 403 });

  const parsed = publicInstallmentLookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'RUT inválido' }, { status: 400 });
  }

  // Topes compartidos entre instancias: por portal (un barrido desde muchas IP)
  // y por RUT dentro del portal (adivinar la fecha de nacimiento de alguien).
  const [byToken, byRut] = await Promise.all([
    checkLayeredRateLimit(token, INSTALLMENT_LOOKUP_TOKEN_RATE_LIMIT),
    checkLayeredRateLimit(`${token}:${cleanRut(parsed.data.rut)}`, INSTALLMENT_LOOKUP_RUT_RATE_LIMIT),
  ]);
  if (!byToken.allowed || !byRut.allowed) {
    return NextResponse.json(
      { success: false, error: 'Se hicieron demasiadas consultas. Intenta de nuevo en una hora o contacta a la organización.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  try {
    const data = await lookupPublicInstallments(token, parsed.data.rut, parsed.data.birthDate);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PortalNotFoundError) return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    captureException(error, { module: 'cuotas-pago-en-linea', extra: { step: 'lookup' } });
    return NextResponse.json({ success: false, error: 'No pudimos consultar las cuotas. Intenta de nuevo más tarde.' }, { status: 500 });
  }
}

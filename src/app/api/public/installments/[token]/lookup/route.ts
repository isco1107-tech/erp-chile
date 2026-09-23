import { NextResponse } from 'next/server';
import { publicInstallmentLookupSchema } from '@/modules/payment-plans/schema';
import { lookupPublicInstallments, PortalNotFoundError } from '@/modules/payment-plans/services/online-payment.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, INSTALLMENT_LOOKUP_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';

/**
 * Portal público de pago de cuotas — paso 1: consulta por RUT de la
 * candidata. Sin sesión: la empresa sale del token de la URL, nunca del body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const rl = checkRateLimit(extractClientIp(req) ?? 'unknown', INSTALLMENT_LOOKUP_RATE_LIMIT);
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

  const parsed = publicInstallmentLookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'RUT inválido' }, { status: 400 });
  }

  try {
    const data = await lookupPublicInstallments(token, parsed.data.rut);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PortalNotFoundError) return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    captureException(error, { module: 'cuotas-pago-en-linea', extra: { step: 'lookup' } });
    return NextResponse.json({ success: false, error: 'No pudimos consultar las cuotas. Intenta de nuevo más tarde.' }, { status: 500 });
  }
}

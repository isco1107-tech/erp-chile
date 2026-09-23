import { NextResponse } from 'next/server';
import { INSTALLMENT_PORTAL_HONEYPOT_FIELD, publicInstallmentCheckoutSchema } from '@/modules/payment-plans/schema';
import {
  createOnlinePaymentOrder,
  InstallmentSelectionError,
  OnlinePaymentsDisabledError,
  PaymentGatewayError,
  PortalNotFoundError,
} from '@/modules/payment-plans/services/online-payment.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, INSTALLMENT_CHECKOUT_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';

/**
 * Portal público de pago de cuotas — paso 2: crea la orden y el cobro en la
 * pasarela, y devuelve la URL a la que se redirige al pagador. El monto se
 * calcula en el servidor desde el saldo de cada cuota; el body solo elige
 * cuáles.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const rl = checkRateLimit(extractClientIp(req) ?? 'unknown', INSTALLMENT_CHECKOUT_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.max(1, Math.ceil((rl.retryAfterMs - Date.now()) / 1000)) : 3600;
    return NextResponse.json(
      { success: false, error: 'Demasiados intentos de pago desde esta conexión. Intenta de nuevo más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo leer la solicitud enviada' }, { status: 400 });
  }

  // Honeypot: se descarta sin crear ningún cobro.
  const honeypot = body[INSTALLMENT_PORTAL_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ success: false, error: 'No se pudo procesar el pago. Intenta de nuevo.' }, { status: 400 });
  }

  const parsed = publicInstallmentCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 });
  }

  try {
    const data = await createOnlinePaymentOrder(token, parsed.data);
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof PortalNotFoundError) return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    if (error instanceof OnlinePaymentsDisabledError) return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    if (error instanceof InstallmentSelectionError) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    if (error instanceof PaymentGatewayError) return NextResponse.json({ success: false, error: error.message }, { status: 502 });
    captureException(error, { module: 'cuotas-pago-en-linea', extra: { step: 'checkout' } });
    return NextResponse.json({ success: false, error: 'No pudimos iniciar el pago. Intenta de nuevo más tarde.' }, { status: 500 });
  }
}

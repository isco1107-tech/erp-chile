import { NextResponse } from 'next/server';
import { getPublicOrderStatus } from '@/modules/payment-plans/services/online-payment.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, INSTALLMENT_STATUS_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/** Estado de un pago en línea por su `accessToken` (página de retorno desde Khipu). */
export async function GET(req: Request, { params }: { params: Promise<{ accessToken: string }> }) {
  const { accessToken } = await params;

  const rl = checkRateLimit(extractClientIp(req) ?? 'unknown', INSTALLMENT_STATUS_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Demasiadas consultas. Espera un momento.' }, { status: 429 });
  }

  try {
    const data = await getPublicOrderStatus(accessToken);
    if (!data) return NextResponse.json({ success: false, error: 'Pago no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    captureException(error, { module: 'cuotas-pago-en-linea', extra: { step: 'status' } });
    return NextResponse.json({ success: false, error: 'No pudimos consultar el pago. Intenta de nuevo.' }, { status: 500 });
  }
}

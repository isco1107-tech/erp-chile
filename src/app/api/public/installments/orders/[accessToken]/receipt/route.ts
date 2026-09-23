import { NextResponse } from 'next/server';
import { getReceiptPdfByAccessToken } from '@/modules/payment-plans/services/online-payment.service';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, INSTALLMENT_STATUS_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/** PDF del comprobante para quien pagó (enlace del correo y de la página de estado). */
export async function GET(req: Request, { params }: { params: Promise<{ accessToken: string }> }) {
  const { accessToken } = await params;

  const rl = checkRateLimit(extractClientIp(req) ?? 'unknown', INSTALLMENT_STATUS_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'Demasiadas consultas. Espera un momento.' }, { status: 429 });
  }

  try {
    const receipt = await getReceiptPdfByAccessToken(accessToken);
    if (!receipt) return NextResponse.json({ success: false, error: 'Comprobante no disponible' }, { status: 404 });
    return new NextResponse(new Uint8Array(receipt.pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${receipt.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    captureException(error, { module: 'cuotas-pago-en-linea', extra: { step: 'receipt' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el comprobante' }, { status: 500 });
  }
}

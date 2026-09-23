import { NextResponse } from 'next/server';
import { AuthError, ModuleNotEnabledError, TenantInactiveError, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { getReceiptPdfForCompany } from '@/modules/payment-plans/services/online-payment.service';

/** Comprobante de un pago en línea desde el panel (ficha del plan de pago). */
export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const session = await requireAuthWithPermission('paymentplans:read');
    const { orderId } = await params;

    const receipt = await getReceiptPdfForCompany(session.companyId, orderId);
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
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    if (error instanceof ModuleNotEnabledError) {
      return NextResponse.json({ success: false, error: 'Módulo no incluido en tu plan actual' }, { status: 403 });
    }
    if (error instanceof TenantInactiveError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    captureException(error, { module: 'cuotas-pago-en-linea', extra: { step: 'panel-receipt' } });
    return NextResponse.json({ success: false, error: 'No se pudo generar el comprobante' }, { status: 500 });
  }
}

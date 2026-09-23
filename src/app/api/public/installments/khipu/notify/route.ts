import { NextResponse } from 'next/server';
import { handleKhipuNotification } from '@/modules/payment-plans/services/online-payment.service';
import { captureException, captureMessage } from '@/lib/observability';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Notificación instantánea de Khipu (API 3.0, JSON).
 *
 * No se confía en el contenido: solo se toma el `payment_id` para ubicar la
 * orden, y `syncOrderWithProvider` consulta el cobro a Khipu con la API key
 * de la empresa dueña de esa orden. Un POST falsificado a esta URL, en el peor
 * caso, provoca una consulta más a Khipu; nunca marca nada como pagado.
 *
 * Respuestas: 200 cuando se procesó (o el cobro no es de este sistema, para
 * que Khipu no reintente para siempre); 500 ante un error interno, para que
 * Khipu sí reintente.
 */
export async function POST(req: Request) {
  const contentLength = Number(req.headers.get('content-length') ?? NaN);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'Body demasiado grande' }, { status: 413 });
  }

  const raw = await req.text();
  let paymentId: string | null = null;
  try {
    const json = JSON.parse(raw) as { payment_id?: unknown };
    if (typeof json.payment_id === 'string') paymentId = json.payment_id;
  } catch {
    // Compatibilidad con notificaciones en formulario (API 1.3 y anteriores).
    paymentId = new URLSearchParams(raw).get('payment_id');
  }

  if (!paymentId || paymentId.length > 100) {
    return NextResponse.json({ success: false, error: 'Falta payment_id' }, { status: 400 });
  }

  try {
    const result = await handleKhipuNotification(paymentId);
    if (result === 'unknown') {
      captureMessage('cuotas-pago-en-linea:notificacion-desconocida', 'warn', {
        module: 'cuotas-pago-en-linea',
        extra: { paymentId },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    captureException(error, { module: 'cuotas-pago-en-linea', extra: { step: 'khipu-notify', paymentId } });
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

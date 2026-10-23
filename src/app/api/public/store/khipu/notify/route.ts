import { NextResponse } from 'next/server';
import { captureException, captureMessage } from '@/lib/observability';
import { STORE_GATEWAY_NOTIFY_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { limitByIp } from '@/modules/ecommerce/public-api';
import { handleKhipuNotification } from '@/modules/ecommerce/services/store-payment.service';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Notificación instantánea de Khipu para pedidos de la tienda (API 3.0, JSON).
 *
 * No se confía en el contenido: solo se toma el `payment_id` para ubicar el pedido, y
 * `syncOrderPayment` CONSULTA el cobro a Khipu con la llave de la empresa dueña del pedido y
 * exige monto, moneda y referencia exactos. Un POST falsificado provoca, en el peor caso, una
 * consulta más a Khipu; nunca marca nada como pagado.
 *
 * 200 cuando se procesó (o el cobro no es de este sistema, para que Khipu no reintente para
 * siempre); 500 ante un error interno, para que Khipu sí reintente.
 */
export async function POST(req: Request) {
  const limited = limitByIp(req, STORE_GATEWAY_NOTIFY_RATE_LIMIT);
  if (limited) return limited;
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
  if (!paymentId || paymentId.length > 100) return NextResponse.json({ success: false, error: 'Falta payment_id' }, { status: 400 });

  try {
    const result = await handleKhipuNotification(paymentId);
    // Un cobro que no ubicamos puede ser dinero movido sin pedido (p. ej. un cobro que quedó huérfano): se escala.
    if (result === 'unknown') captureMessage('tienda-en-linea:notificacion-desconocida', 'error', { module: 'tienda-en-linea', extra: { paymentId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    captureException(error, { module: 'tienda-en-linea', extra: { reason: 'khipu-notify', paymentId } });
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

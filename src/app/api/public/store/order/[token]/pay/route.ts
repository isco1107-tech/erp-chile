import { STORE_ORDER_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { jsonError, jsonOk, limitByIp, storeErrorResponse } from '@/modules/ecommerce/public-api';
import { restartOrderPayment } from '@/modules/ecommerce/services/store-payment.service';

export const dynamic = 'force-dynamic';

/**
 * «Pagar ahora» desde la página del pedido: reabre (o reutiliza) el cobro en la pasarela
 * mientras el pedido siga abierto y con stock apartado. El enlace secreto del pedido es la
 * credencial; no revela nada de otros pedidos.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limited = limitByIp(req, STORE_ORDER_RATE_LIMIT);
  if (limited) return limited;
  if (!/^[a-f0-9]{64}$/.test(token)) return jsonError('No encontramos ese pedido.', 404);

  try {
    const redirectUrl = await restartOrderPayment(token);
    return jsonOk({ redirectUrl });
  } catch (error) {
    return storeErrorResponse(error, { reason: 'public-order-pay', fallback: 'No pudimos abrir el pago. Intenta de nuevo en unos minutos.' });
  }
}

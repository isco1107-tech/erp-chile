import { NextResponse } from 'next/server';
import { captureExceptionAndFlush } from '@/lib/observability';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { expireStaleOrders } from '@/modules/ecommerce/services/store-payment.service';

export const dynamic = 'force-dynamic';

/**
 * Cron diario de la tienda en línea: pone al día los pedidos sin pagar cuya reserva de stock
 * terminó. Los que se pagan en línea se consultan primero a la pasarela (el dinero pudo llegar);
 * el resto vence y libera su stock. La disponibilidad ya ignora las reservas vencidas, así que
 * esto es orden, no corrección.
 */
export async function GET(req: Request) {
  try {
    if (!isCronAuthorized(req)) return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    const closed = await expireStaleOrders(undefined, 200);
    return NextResponse.json({ success: true, closedOrders: closed, timestamp: new Date().toISOString() });
  } catch (error) {
    await captureExceptionAndFlush(error, { module: 'cron:tienda-en-linea' });
    return NextResponse.json({ success: false, error: 'Error al ejecutar el cron de la tienda' }, { status: 500 });
  }
}

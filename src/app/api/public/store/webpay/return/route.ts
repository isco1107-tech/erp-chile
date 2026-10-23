import { NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/email/mailer';
import { captureException } from '@/lib/observability';
import { handleWebpayReturn } from '@/modules/ecommerce/services/store-payment.service';

export const dynamic = 'force-dynamic';

/**
 * Regreso del comprador desde Webpay (llega por POST o GET según la configuración de Transbank).
 * `token_ws` = el comprador terminó el flujo; `TBK_TOKEN` = anuló el pago en el sitio de Transbank.
 * Nada de lo que llega aquí se cree: solo sirve para ubicar el pedido, cuyo cobro se CONSULTA a
 * Transbank antes de darlo por pagado. Termina siempre con un 303 a la página del pedido.
 */
async function handle(tokenWs: string | null, tbkToken: string | null) {
  try {
    const destination = await handleWebpayReturn({ tokenWs, tbkToken });
    // Un token que no es de este sistema no revela nada: vuelve a la plataforma.
    return NextResponse.redirect(destination ?? getAppUrl(), 303);
  } catch (error) {
    captureException(error, { module: 'tienda-en-linea', extra: { reason: 'webpay-return' } });
    return NextResponse.redirect(getAppUrl(), 303);
  }
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  return handle(params.get('token_ws'), params.get('TBK_TOKEN'));
}

export async function POST(req: Request) {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > 16 * 1024) return NextResponse.redirect(getAppUrl(), 303);
  let tokenWs: string | null = null;
  let tbkToken: string | null = null;
  try {
    const form = await req.formData();
    const ws = form.get('token_ws');
    const tbk = form.get('TBK_TOKEN');
    tokenWs = typeof ws === 'string' ? ws : null;
    tbkToken = typeof tbk === 'string' ? tbk : null;
  } catch {
    /* cuerpo ilegible: se trata como un token que no es nuestro */
  }
  return handle(tokenWs, tbkToken);
}

import { NextResponse } from 'next/server';
import { captureException } from '@/lib/observability';
import { responderWebhook } from '@/lib/supersuite/cliente';
import { manejadoresOrdenes } from '@/lib/supersuite/ordenes';

/**
 * Webhook de órdenes de la Supersuite (consola SaaS): activar módulos, cambiar
 * plan, suspender… La Supersuite hace POST aquí apenas se transmite una orden.
 *
 * Sin sesión a propósito (lo llama un servidor, no una persona): la
 * autenticación es la firma `X-Supersuite-Firma` (HMAC-SHA256 con marca de
 * tiempo, máximo 5 minutos) con el secreto compartido SUPERSUITE_WEBHOOK_SECRET.
 * Sin secreto configurado el endpoint no acepta nada.
 *
 * Responde 200 { ok, mensaje } con el resultado de aplicar la orden; la
 * Supersuite lo muestra en su bitácora. Un 401 (firma inválida) o un 5xx hacen
 * que la Supersuite reintente con espera creciente.
 */
export async function POST(req: Request) {
  const secreto = process.env.SUPERSUITE_WEBHOOK_SECRET?.trim();
  if (!secreto) return NextResponse.json({ ok: false, mensaje: 'Las órdenes de la Supersuite no están configuradas en Aether' }, { status: 503 });
  try {
    const r = await responderWebhook(secreto, manejadoresOrdenes, req.headers.get('x-supersuite-firma'), await req.text());
    return NextResponse.json(r.cuerpo, { status: r.status });
  } catch (error) {
    captureException(error, { module: 'supersuite', extra: { step: 'ordenes' } });
    return NextResponse.json({ ok: false, mensaje: 'Error interno de Aether' }, { status: 500 });
  }
}

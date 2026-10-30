import { NextResponse } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, SALES_LEAD_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException, captureMessage } from '@/lib/observability';
import { sendEmail } from '@/lib/email/mailer';
import { buildSalesLeadEmail, getSalesEmail, salesLeadSchema, SALES_LEAD_HONEYPOT_FIELD } from '@/lib/marketing/sales-lead';
import { attributionLabel, parseAttributionPayload } from '@/lib/marketing/attribution';
import { ACCION_LEAD, datosDeLead, newLeadRef } from '@/lib/marketing/supersuite-events';
import { marketingSupersuite } from '@/lib/supersuite';

/**
 * Solicitud de demo/cotización del landing. Público y sin sesión (como el
 * resto de `/api/public/**`): rate limit por IP + honeypot + Zod. No toca la
 * base de datos — el destino es el correo de ventas (`AETHER_SALES_EMAIL`).
 *
 * Marketing propio (ADR 0015): el formulario trae la campaña que guardó el
 * navegador (`attribution`, opcional; si no calza se descarta y el lead sigue).
 * El correo lleva una referencia opaca `L-XXXXXXXX` y la campaña, y la
 * Supersuite recibe el evento `lead_recibido` SOLO con esa referencia, la
 * campaña y fichas de listas cerradas: nunca nombre, correo ni teléfono.
 */

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request) {
  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, SALES_LEAD_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.ceil((rl.retryAfterMs - Date.now()) / 1000) : 3600;
    return NextResponse.json(
      { success: false, error: 'Recibimos varias solicitudes desde esta conexión. Escríbenos directo por correo o intenta más tarde.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('No se pudo leer la solicitud enviada', 400);
  }

  // Honeypot: se responde éxito sin enviar nada, sin dar pistas al bot.
  const honeypot = body[SALES_LEAD_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ success: true, data: { received: true } });
  }

  const parsed = salesLeadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario', 400);
  }

  const attribution = parseAttributionPayload(body.attribution);
  const ref = newLeadRef();

  try {
    const email = buildSalesLeadEmail(parsed.data, new Date(), { ref, campaign: attributionLabel(attribution) });
    const result = await sendEmail({ to: getSalesEmail(), replyTo: parsed.data.email, ...email });
    if (result.status === 'failed') {
      captureMessage('marketing:lead:envio-fallido', 'error', { module: 'marketing', extra: { provider: result.provider } });
      return jsonError('No pudimos registrar tu solicitud. Escríbenos directamente por correo.', 502);
    }
    marketingSupersuite(ACCION_LEAD, datosDeLead({ ref, formulario: 'demo', equipo: parsed.data.teamSize, areas: parsed.data.solutions, attribution }));
    return NextResponse.json({ success: true, data: { received: true } });
  } catch (error) {
    captureException(error, { module: 'marketing', extra: { route: 'public-leads' } });
    return jsonError('No pudimos registrar tu solicitud. Escríbenos directamente por correo.', 500);
  }
}

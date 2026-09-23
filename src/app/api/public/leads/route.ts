import { NextResponse } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, SALES_LEAD_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException, captureMessage } from '@/lib/observability';
import { sendEmail } from '@/lib/email/mailer';
import { buildSalesLeadEmail, salesLeadSchema, SALES_LEAD_HONEYPOT_FIELD } from '@/lib/marketing/sales-lead';

/**
 * Solicitud de demo/cotización del landing. Público y sin sesión (como el
 * resto de `/api/public/**`): rate limit por IP + honeypot + Zod. No toca la
 * base de datos — el destino es el correo de ventas (`AETHER_SALES_EMAIL`).
 */

const SALES_EMAIL = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';

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

  try {
    const email = buildSalesLeadEmail(parsed.data);
    const result = await sendEmail({ to: SALES_EMAIL, replyTo: parsed.data.email, ...email });
    if (result.status === 'failed') {
      captureMessage('marketing:lead:envio-fallido', 'error', { module: 'marketing', extra: { provider: result.provider } });
      return jsonError('No pudimos registrar tu solicitud. Escríbenos directamente por correo.', 502);
    }
    return NextResponse.json({ success: true, data: { received: true } });
  } catch (error) {
    captureException(error, { module: 'marketing', extra: { route: 'public-leads' } });
    return jsonError('No pudimos registrar tu solicitud. Escríbenos directamente por correo.', 500);
  }
}

import { NextResponse } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { checkRateLimit, MODULE_QUOTE_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { captureException, captureMessage } from '@/lib/observability';
import { sendEmail } from '@/lib/email/mailer';
import { getSalesEmail } from '@/lib/marketing/sales-lead';
import { buildModuleQuoteEmail, moduleQuoteSchema, MODULE_QUOTE_HONEYPOT_FIELD, selectedModules } from '@/lib/marketing/module-quote';

/**
 * Cotización de módulos desde la vitrina de la landing (carrito). Público y
 * sin sesión, igual que `/api/public/leads`: rate limit por IP + honeypot +
 * Zod. No toca la base de datos ni le escribe a la persona: el destino es el
 * correo de ventas, con `replyTo` para responderle directo.
 */

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: Request) {
  const clientIp = extractClientIp(req) ?? 'unknown';
  const rl = checkRateLimit(clientIp, MODULE_QUOTE_RATE_LIMIT);
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
  const honeypot = body[MODULE_QUOTE_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return NextResponse.json({ success: true, data: { received: true } });
  }

  const parsed = moduleQuoteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario', 400);
  }

  const modules = selectedModules(parsed.data.moduleIds);
  if (modules.length === 0) {
    return jsonError('Elige al menos un módulo para cotizar', 400);
  }

  try {
    const email = buildModuleQuoteEmail(parsed.data, modules);
    const result = await sendEmail({ to: getSalesEmail(), replyTo: parsed.data.email, ...email });
    if (result.status === 'failed') {
      captureMessage('marketing:cotizacion-modulos:envio-fallido', 'error', { module: 'marketing', extra: { provider: result.provider } });
      return jsonError('No pudimos registrar tu solicitud. Escríbenos directamente por correo.', 502);
    }
    return NextResponse.json({ success: true, data: { received: true } });
  } catch (error) {
    captureException(error, { module: 'marketing', extra: { route: 'public-module-quote' } });
    return jsonError('No pudimos registrar tu solicitud. Escríbenos directamente por correo.', 500);
  }
}

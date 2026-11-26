import { NextResponse } from 'next/server';
import { checkLayeredRateLimit, hitDurableRateLimit, peekDurableRateLimit, retryAfterSeconds } from '@/lib/security/durable-rate-limit';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { captureException } from '@/lib/observability';
import { CHECK_IN_TOKEN_PATTERN } from '@/lib/academy/check-in';
import { ACADEMY_CHECK_IN_IP_RATE_LIMIT, ACADEMY_CHECK_IN_LINK_RATE_LIMIT, ACADEMY_CHECK_IN_MISS_RATE_LIMIT } from '@/lib/security/rate-limiter';
import { ACADEMY_HONEYPOT_FIELD, publicCheckInSchema } from '@/modules/academy/schema';
import { resolveCheckIn, submitCheckIn } from '@/modules/academy/services/academy-check-in.service';

/** El cuerpo trae solo un RUT: cualquier cosa más grande no es de este formulario. */
const MAX_BODY_BYTES = 2 * 1024;

/**
 * Registro de asistencia con QR, sin sesión. La empresa, el grupo y el día
 * salen SIEMPRE del token; del navegador solo se acepta el RUT. Límites:
 * por IP (holgado, porque un curso comparte el Wi-Fi), por QR, y uno más
 * estricto para los RUT que no están en el grupo (quien prueba RUT para saber
 * quién es alumna). Campo señuelo como en los demás formularios públicos.
 */

function jsonError(message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ success: false, error: message }, { status, headers });
}

const TOO_MANY = 'Hubo demasiados intentos desde esta conexión. Espera unos minutos y vuelve a intentarlo, o avísale a tu profesora.';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!CHECK_IN_TOKEN_PATTERN.test(token)) return jsonError('Este QR no es válido. Escanea el que muestra tu profesora.', 404);

  const clientIp = extractClientIp(req) ?? 'unknown';
  const ipLimit = await checkLayeredRateLimit(clientIp, ACADEMY_CHECK_IN_IP_RATE_LIMIT);
  if (!ipLimit.allowed) return jsonError(TOO_MANY, 429, { 'Retry-After': String(retryAfterSeconds(ipLimit, 600)) });
  // Los fallos se cuentan aparte y solo cuando ocurren; aquí solo se consulta el cupo.
  const missLimit = await peekDurableRateLimit(clientIp, ACADEMY_CHECK_IN_MISS_RATE_LIMIT);
  if (!missLimit.allowed) return jsonError(TOO_MANY, 429, { 'Retry-After': String(retryAfterSeconds(missLimit, 600)) });

  let body: unknown;
  try {
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return jsonError('Solicitud inválida', 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return jsonError('Solicitud inválida', 413);
    body = JSON.parse(raw);
  } catch {
    return jsonError('Solicitud inválida', 400);
  }

  // Señuelo: un bot completa el campo oculto. Se responde como si el RUT no estuviera, sin tocar nada.
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>)[ACADEMY_HONEYPOT_FIELD] === 'string' && (body as Record<string, string>)[ACADEMY_HONEYPOT_FIELD] !== '') {
    return NextResponse.json({ success: true, data: { kind: 'NOT_FOUND' } });
  }

  const parsed = publicCheckInSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Revisa tu RUT', 400);

  try {
    const info = await resolveCheckIn(token);
    if (!info) return jsonError('Este QR ya no está disponible. Pídele a tu profesora que muestre el de hoy.', 404);

    const linkLimit = await checkLayeredRateLimit(info.linkId, ACADEMY_CHECK_IN_LINK_RATE_LIMIT);
    if (!linkLimit.allowed) return jsonError('Este QR recibió demasiados intentos. Pídele a tu profesora que genere uno nuevo.', 429);

    const outcome = await submitCheckIn(info, parsed.data.rut);
    if (outcome.kind === 'NOT_FOUND') await hitDurableRateLimit(clientIp, ACADEMY_CHECK_IN_MISS_RATE_LIMIT);
    return NextResponse.json({ success: true, data: outcome });
  } catch (error) {
    captureException(error, { module: 'academia', extra: { reason: 'public-check-in' } });
    return jsonError('No pudimos registrar tu asistencia. Intenta de nuevo en un momento.', 500);
  }
}

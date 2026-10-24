import 'server-only';

import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { checkRateLimit, type RateLimitConfig } from '@/lib/security/rate-limiter';
import { extractRequestInfo, logSecurityEvent } from '@/lib/security/security-logger';
import { captureException } from '@/lib/observability';
import { SUPPLIER_SESSION_COOKIE, SUPPLIER_SESSION_COOKIE_OPTIONS, createSupplierSessionToken } from '@/lib/supplier-portal/session';
import { SellerCenterError } from '@/modules/inventory/services/seller-center-auth.service';

/**
 * Piezas comunes de las rutas públicas del Seller Center (`/api/supplier-portal/*`): límite por IP,
 * cuerpo JSON acotado y validado, la cookie de sesión y errores en español sin detalle técnico.
 */

const MAX_BODY_BYTES = 4_096;

export function json(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** Límite por IP; `null` si pasa, o la respuesta 429. */
export function limited(req: Request, config: RateLimitConfig, route: string): NextResponse | null {
  const { ip, userAgent } = extractRequestInfo(req);
  const result = checkRateLimit(ip ?? 'unknown', config);
  if (result.allowed) return null;
  logSecurityEvent({ type: 'RATE_LIMITED', ip, userAgent, metadata: { route, portal: 'seller-center' } });
  return json({ success: false, error: 'Demasiados intentos. Vuelve a intentar en unos minutos' }, 429);
}

export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const text = await req.text().catch(() => '');
  if (text.length > MAX_BODY_BYTES) return { ok: false, response: json({ success: false, error: 'Solicitud demasiado grande' }, 413) };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, response: json({ success: false, error: 'Solicitud inválida' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: json({ success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, 400) };
  return { ok: true, data: parsed.data };
}

export async function withSession(body: unknown, session: { personId: string; membershipId: string; sessionVersion: number }): Promise<NextResponse> {
  const response = json(body);
  response.cookies.set(SUPPLIER_SESSION_COOKIE, await createSupplierSessionToken(session), SUPPLIER_SESSION_COOKIE_OPTIONS);
  return response;
}

export function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(SUPPLIER_SESSION_COOKIE, '', { ...SUPPLIER_SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

/** Error conocido → su mensaje; cualquier otro → observabilidad y un mensaje genérico. */
export function failure(error: unknown, route: string): NextResponse {
  if (error instanceof SellerCenterError) return json({ success: false, error: error.message }, 400);
  captureException(error, { module: 'portal-proveedores', extra: { route } });
  return json({ success: false, error: 'No se pudo completar. Intenta de nuevo en un momento' }, 500);
}

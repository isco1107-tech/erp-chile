import 'server-only';

import { NextResponse } from 'next/server';
import { extractClientIp } from '@/lib/auth/ip-allowlist';
import { captureException } from '@/lib/observability';
import { checkRateLimit, type RateLimitConfig } from '@/lib/security/rate-limiter';
import { OutOfStockError, StoreError } from './errors';

/**
 * Piezas comunes de las rutas públicas de la tienda (`/api/public/store/**`). Sin sesión: la
 * empresa sale SIEMPRE del sitio (su dirección), nunca del cuerpo. Cada ruta aplica límite
 * por IP, acota el cuerpo antes de leerlo y responde con mensajes en español accionables;
 * los errores que no son de la tienda van a observabilidad con un mensaje genérico.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: NO_STORE });
}

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status, headers: { ...NO_STORE, ...headers } });
}

/** Responde 429 si la IP superó el límite; `null` si puede seguir. */
export function limitByIp(req: Request, config: RateLimitConfig, message = 'Demasiados intentos desde esta conexión. Espera unos minutos e intenta de nuevo.') {
  const result = checkRateLimit(extractClientIp(req) ?? 'unknown', config);
  if (result.allowed) return null;
  const retryAfter = result.retryAfterMs ? Math.max(1, Math.ceil((result.retryAfterMs - Date.now()) / 1000)) : 600;
  return jsonError(message, 429, {}, { 'Retry-After': String(retryAfter) });
}

/** Cuerpo JSON acotado: se rechaza por el largo declarado y por el real. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return { ok: false, response: jsonError('La solicitud es demasiado grande.', 413) };
  try {
    const raw = await req.text();
    if (raw.length > maxBytes) return { ok: false, response: jsonError('La solicitud es demasiado grande.', 413) };
    return { ok: true, body: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: jsonError('No pudimos leer tu solicitud.', 400) };
  }
}

/** Error de servicio → respuesta. Solo el mensaje de un `StoreError` llega al comprador. */
export function storeErrorResponse(error: unknown, context: { reason: string; companyId?: string; fallback: string }) {
  if (error instanceof OutOfStockError) {
    return jsonError(error.message, error.status, { code: 'OUT_OF_STOCK', shortages: error.shortages.map((item) => ({ productId: item.productId, name: item.name, requested: item.requested, available: item.available })) });
  }
  if (error instanceof StoreError) return jsonError(error.message, error.status, error.field ? { field: error.field } : {});
  captureException(error, { module: 'tienda-en-linea', ...(context.companyId ? { companyId: context.companyId } : {}), extra: { reason: context.reason } });
  return jsonError(context.fallback, 500);
}

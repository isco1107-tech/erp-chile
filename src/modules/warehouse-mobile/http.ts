import { NextResponse } from 'next/server';
import { AuthError, IpNotAllowedError, ModuleNotEnabledError, TenantInactiveError, authErrorMessage, requireAuthWithPermission, type AuthContext } from '@/lib/auth/guards';
import type { Permission } from '@/lib/auth/permissions';
import { captureException } from '@/lib/observability';
import { checkRateLimit, type RateLimitConfig } from '@/lib/security/rate-limiter';
import type { ApiError, ApiOk } from './types';

/**
 * Envoltorio común de las rutas `/api/bodega/*`. El proxy no intercepta `/api`
 * (ver `src/proxy.ts`), así que la autorización vive acá: sesión válida,
 * permiso del módulo y tope de uso por usuario, siempre con respuesta JSON
 * (un 307 al HTML de /login no le sirve a una app que espera datos).
 */

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOk<T>> {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(error: string, status: number, headers?: Record<string, string>): NextResponse<ApiError> {
  return NextResponse.json({ success: false, error }, { status, headers });
}

/** 429 con `Retry-After` en segundos, para que la app sepa cuándo volver. */
export function tooMany(retryAfterMs: number | null): NextResponse<ApiError> {
  const seconds = Math.max(1, Math.ceil(((retryAfterMs ?? Date.now() + 5_000) - Date.now()) / 1000));
  return fail('Estás haciendo demasiadas consultas seguidas. Espera un momento.', 429, { 'Retry-After': String(seconds) });
}

export interface BodegaRequestOptions {
  permission: Permission;
  /** Tope de uso por usuario. */
  limit?: RateLimitConfig;
  module?: string;
}

/** Ejecuta `handler` con la sesión ya validada; traduce los errores de acceso a JSON. */
export async function withBodegaAuth(options: BodegaRequestOptions, handler: (context: AuthContext) => Promise<Response>): Promise<Response> {
  let companyId: string | undefined;
  try {
    const context = await requireAuthWithPermission(options.permission);
    companyId = context.companyId;
    if (options.limit) {
      const limited = checkRateLimit(context.id, options.limit);
      if (!limited.allowed) return tooMany(limited.retryAfterMs);
    }
    return await handler(context);
  } catch (error) {
    if (error instanceof IpNotAllowedError) return fail(error.message, 403);
    if (error instanceof AuthError) return fail(error.message, error.status);
    if (error instanceof TenantInactiveError) return fail(error.message, 403);
    if (error instanceof ModuleNotEnabledError) return fail(authErrorMessage(error) ?? 'Módulo no incluido en tu plan', 403);
    captureException(error, { module: options.module ?? 'bodega-movil', companyId });
    return fail('Ocurrió un error inesperado. Intenta de nuevo.', 500);
  }
}

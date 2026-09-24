import 'server-only';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { hashApiKey, readApiKey, type ApiScope } from './api-keys';

/**
 * Autenticación de la API pública (`/api/v1/*`). No usa la sesión del panel:
 * cada solicitud trae su llave, que identifica a UNA empresa y sus alcances.
 * Todo lo que haga la ruta después filtra por `companyId` de la llave, nunca
 * por algo que venga en la solicitud.
 */

export interface ApiContext {
  companyId: string;
  keyId: string;
  scopes: string[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
  }
}

/** 120 solicitudes por minuto por llave (por instancia; ver `rate-limiter.ts`). */
const RATE_LIMIT = { prefix: 'public-api', limit: 120, windowMs: 60_000 };
/** `lastUsedAt` se actualiza como máximo cada 5 minutos para no escribir en cada solicitud. */
const LAST_USED_THROTTLE_MS = 5 * 60_000;

type ScopeFeature = 'hasInventory' | 'hasDteBilling' | 'hasTreasury';

/**
 * Módulo que debe estar contratado para usar cada alcance: la API no puede ser
 * un atajo hacia algo que el panel le tiene apagado a la empresa. Contactos es
 * núcleo y no depende de ningún módulo.
 */
const SCOPE_FEATURE: Record<ApiScope, ScopeFeature | null> = {
  'contacts:read': null,
  'contacts:write': null,
  'products:read': 'hasInventory',
  'stock:read': 'hasInventory',
  'sales:read': 'hasDteBilling',
  'sales:write': 'hasDteBilling',
  'treasury:read': 'hasTreasury',
  'treasury:write': 'hasTreasury',
};

/** `scope: null` solo para `/api/v1/me`: basta con una llave válida. */
export async function authenticateApiRequest(req: Request, scope: ApiScope | null): Promise<ApiContext> {
  const plaintext = readApiKey(req.headers);
  if (!plaintext) throw new ApiError('Falta la llave: envía "Authorization: Bearer aek_..."', 401, 'missing_api_key');

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plaintext) },
    select: {
      id: true,
      companyId: true,
      scopes: true,
      revokedAt: true,
      lastUsedAt: true,
      company: {
        select: {
          status: true,
          features: { select: { hasPublicApi: true, hasInventory: true, hasDteBilling: true, hasTreasury: true } },
        },
      },
    },
  });
  if (!key || key.revokedAt) throw new ApiError('Llave inválida o revocada', 401, 'invalid_api_key');
  if (!['ACTIVE', 'TRIAL'].includes(key.company.status)) throw new ApiError('La empresa no está activa', 403, 'company_inactive');
  const features = key.company.features;
  if (!features?.hasPublicApi) throw new ApiError('El módulo API e Integraciones no está contratado', 403, 'module_disabled');
  if (scope !== null && !key.scopes.includes(scope)) throw new ApiError(`La llave no tiene el permiso "${scope}"`, 403, 'insufficient_scope');
  const requiredFeature = scope !== null ? SCOPE_FEATURE[scope] : null;
  if (requiredFeature && !features[requiredFeature]) {
    throw new ApiError(`El módulo necesario para "${scope}" no está contratado`, 403, 'module_disabled');
  }

  const rate = checkRateLimit(key.id, RATE_LIMIT);
  if (!rate.allowed) throw new ApiError('Demasiadas solicitudes: espera un momento', 429, 'rate_limited');

  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    void prisma.apiKey.updateMany({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { companyId: key.companyId, keyId: key.id, scopes: key.scopes };
}

export function apiOk<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }): NextResponse {
  return NextResponse.json({ data, ...(init?.meta ? { meta: init.meta } : {}) }, { status: init?.status ?? 200 });
}

/**
 * Traduce cualquier error a una respuesta JSON estable `{ error: { code, message } }`.
 * Errores de negocio (Error simple) → 422 con su mensaje; lo inesperado → 500
 * genérico y a observabilidad.
 */
export function apiError(error: unknown, context: { route: string; companyId?: string }): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof Error && error.name === 'Error') {
    return NextResponse.json({ error: { code: 'unprocessable', message: error.message } }, { status: 422 });
  }
  captureException(error, { module: 'api-publica', companyId: context.companyId, extra: { route: context.route } });
  return NextResponse.json({ error: { code: 'internal_error', message: 'Error interno. Si persiste, contacta a soporte.' } }, { status: 500 });
}

/** 400 con el detalle de qué campo falló, en el mismo formato `{ error }` que el resto. */
export function apiValidationError(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'validation_error',
        message: issues[0]?.message ?? 'Datos inválidos',
        issues: issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
      },
    },
    { status: 400 }
  );
}

/** Paginación estándar: `?page=1&pageSize=50` (máx. 200). */
export function pagination(url: URL): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

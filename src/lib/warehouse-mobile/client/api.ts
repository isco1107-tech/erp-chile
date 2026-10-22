import type { SyncOperation } from '@/modules/warehouse-mobile/schema';
import type { ApiResult, BootstrapResponse, IdentifyResponse, LookupResponse, RecentOp, SyncResponse } from '@/modules/warehouse-mobile/types';

/**
 * Llamadas de la app al servidor, con los fallos clasificados por lo que la app
 * debe HACER con ellos (no por el código HTTP crudo):
 *
 *  - `offline`  no hubo respuesta (sin señal, servidor caído, se agotó el tiempo): reintentar con espera.
 *  - `auth`     la sesión venció (401) o no tiene permiso (403): no reintentar solo; pedir iniciar sesión.
 *  - `rate`     el servidor pidió esperar (429): reintentar después de `retryAfterMs`.
 *  - `server`   error del servidor (5xx): reintentar con espera.
 *  - `client`   el servidor rechazó la solicitud (4xx): reintentar igual no sirve.
 */
export type ApiFailure =
  | { kind: 'offline'; message: string }
  | { kind: 'auth'; status: 401 | 403; message: string }
  | { kind: 'rate'; retryAfterMs: number; message: string }
  | { kind: 'server'; status: number; message: string }
  | { kind: 'client'; status: number; message: string };

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

const DEFAULT_TIMEOUT_MS = 30_000;

export type Fetcher = typeof fetch;

async function call<T>(fetcher: Fetcher, url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetcher(url, { ...init, credentials: 'same-origin', signal: controller.signal });
  } catch {
    return { ok: false, failure: { kind: 'offline', message: 'Sin conexión con el servidor.' } };
  } finally {
    clearTimeout(timer);
  }

  // Un proxy o la red del local pueden devolver HTML en vez de JSON: se trata como "sin conexión útil".
  let body: ApiResult<T> | null = null;
  try {
    body = (await response.json()) as ApiResult<T>;
  } catch {
    body = null;
  }

  if (response.ok && body?.success) return { ok: true, data: body.data };
  const message = body && !body.success ? body.error : 'El servidor no respondió como se esperaba.';

  if (response.status === 401 || response.status === 403) return { ok: false, failure: { kind: 'auth', status: response.status, message } };
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    return { ok: false, failure: { kind: 'rate', retryAfterMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 10) * 1000, message } };
  }
  if (response.status >= 500) return { ok: false, failure: { kind: 'server', status: response.status, message } };
  if (!body) return { ok: false, failure: { kind: 'offline', message: 'Respuesta inesperada del servidor.' } };
  return { ok: false, failure: { kind: 'client', status: response.status, message } };
}

export interface BodegaApi {
  bootstrap(): Promise<ApiResponse<BootstrapResponse>>;
  lookupCode(code: string, warehouseId: string): Promise<ApiResponse<LookupResponse>>;
  search(query: string, warehouseId: string): Promise<ApiResponse<LookupResponse>>;
  identify(photo: Blob, warehouseId: string): Promise<ApiResponse<IdentifyResponse>>;
  uploadPhoto(photo: Blob, clientOpId: string): Promise<ApiResponse<{ url: string }>>;
  sync(ops: readonly SyncOperation[]): Promise<ApiResponse<SyncResponse>>;
  recent(): Promise<ApiResponse<RecentOp[]>>;
}

export function createBodegaApi(fetcher: Fetcher = (...args) => fetch(...args)): BodegaApi {
  const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    bootstrap: () => call(fetcher, '/api/bodega/bootstrap', { method: 'GET', cache: 'no-store' }, 15_000),
    lookupCode: (code, warehouseId) => call(fetcher, `/api/bodega/lookup?${new URLSearchParams({ code, warehouseId })}`, { method: 'GET', cache: 'no-store' }, 15_000),
    search: (query, warehouseId) => call(fetcher, `/api/bodega/lookup?${new URLSearchParams({ q: query, warehouseId })}`, { method: 'GET', cache: 'no-store' }, 15_000),
    identify: (photo, warehouseId) => {
      const form = new FormData();
      form.set('file', photo, 'foto.jpg');
      form.set('warehouseId', warehouseId);
      return call(fetcher, '/api/bodega/identify', { method: 'POST', body: form }, 45_000);
    },
    uploadPhoto: (photo, clientOpId) => {
      const form = new FormData();
      form.set('file', photo, 'foto.jpg');
      form.set('clientOpId', clientOpId);
      return call(fetcher, '/api/bodega/photo', { method: 'POST', body: form }, 45_000);
    },
    sync: (ops) => call(fetcher, '/api/bodega/sync', json({ ops }), 60_000),
    recent: () => call(fetcher, '/api/bodega/recent', { method: 'GET', cache: 'no-store' }, 15_000),
  };
}

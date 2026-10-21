import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthError, authErrorMessage } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { WarehouseConflict } from './services/warehouse-mobile.service';

export function warehouseJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}
export function warehouseFailure(error: unknown): NextResponse {
  const auth = authErrorMessage(error);
  if (auth) return warehouseJson({ error: auth }, error instanceof AuthError ? error.status : 403);
  if (error instanceof ZodError) return warehouseJson({ error: error.issues[0]?.code === 'custom' ? error.issues[0].message : 'Revisa los datos enviados. Si la aplicación está desactualizada, actualízala antes de sincronizar.' }, 400);
  if (error instanceof WarehouseConflict) return warehouseJson({ error: error.message }, 409);
  captureException(error, { module: 'inventario', extra: { surface: 'bodega-movil' } });
  return warehouseJson({ error: 'No se pudo completar la operación. Los registros del teléfono siguen guardados para reintentar.' }, 500);
}
export function assertWarehouseOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const expected = new URL(request.url).origin;
  const configured = process.env.APP_URL ? new URL(process.env.APP_URL).origin : expected;
  if (!origin || (origin !== expected && origin !== configured)) throw new AuthError('Abre la bodega desde Aether para registrar movimientos', 403);
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new AuthError('Solicitud de otro sitio rechazada', 403);
}
export function assertWarehouseRate(userId: string, lane: 'sync' | 'catalog' = 'sync'): void {
  const result = checkRateLimit(userId, { prefix: `warehouse-${lane}`, limit: lane === 'catalog' ? 600 : 120, windowMs: 60_000 });
  if (!result.allowed) throw new WarehouseConflict('Hay demasiados intentos. Espera un momento y vuelve a sincronizar.');
}
export async function warehouseBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 128_000) throw new WarehouseConflict('Envía menos registros por sincronización');
  const reader = request.body?.getReader();
  if (!reader) throw new WarehouseConflict('No se recibieron registros');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 128_000) { await reader.cancel(); throw new WarehouseConflict('Envía menos registros por sincronización'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const content = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(content);
  try { return JSON.parse(text) as unknown; } catch { throw new WarehouseConflict('No se pudieron leer los datos enviados'); }
}

import { WarehouseClient, WarehouseConnectionError } from './local';
import { browserWarehouseStore } from './browser-store';

export async function warehouseFetch(path: string, body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const json: unknown = await response.json();
    if (!response.ok) {
      const message = typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string' ? json.error : 'No se pudo conectar con Aether';
      throw new WarehouseConnectionError(message, response.status);
    }
    return json;
  } catch (error) {
    if (error instanceof WarehouseConnectionError) throw error;
    throw new WarehouseConnectionError('No hay conexión con Aether. Lo guardado en este teléfono se enviará al volver a conectar.');
  } finally { clearTimeout(timeout); }
}
export function createBrowserWarehouse(): WarehouseClient {
  return new WarehouseClient(browserWarehouseStore(), { request: warehouseFetch }, () => crypto.randomUUID());
}

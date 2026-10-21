import NativeWarehouse from '../modules/aether-warehouse';
import { WarehouseConnectionError, type WarehouseTransport } from '../../../src/lib/warehouse/local';

export const nativeTransport: WarehouseTransport = {
  async request(path, body) {
    let response: { status: number; body: string };
    try { response = await NativeWarehouse.request(path, body === undefined ? null : JSON.stringify(body)); }
    catch { throw new WarehouseConnectionError('No hay conexión con Aether. Tus registros siguen guardados en este teléfono.'); }
    let data: unknown;
    try { data = JSON.parse(response.body); } catch { throw new WarehouseConnectionError('Aether no devolvió una respuesta válida. Reintenta con conexión.', response.status); }
    if (response.status < 200 || response.status >= 300) {
      const error = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'Vuelve a iniciar sesión con Aether';
      throw new WarehouseConnectionError(error, response.status);
    }
    return data;
  },
};

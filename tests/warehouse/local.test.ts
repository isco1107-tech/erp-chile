import { randomUUID } from 'node:crypto';
import { WarehouseClient, assertOfflineAccess, projectedQuantity, type WarehouseStore, type WarehouseTransport } from '@/lib/warehouse/local';
import { warehouseScope, type WarehouseBootstrap, type WarehouseLocalState, type WarehouseOperation } from '@/lib/warehouse/contracts';

const now = Date.parse('2026-10-21T12:00:00Z');
function bootstrap(userId = 'user'): WarehouseBootstrap {
  return { protocol: 1, identity: { companyId: 'company', userId, companyName: 'Empresa', userName: 'Operario', offlineUntil: new Date(now + 3600000).toISOString(), serverTime: new Date(now).toISOString(), canOperate: true, canApprove: false, canReceive: true },
    warehouses: [{ id: 'w', name: 'Principal', isDefault: true }], orders: [], nextCursor: null,
    products: [{ id: 'p', sku: 'P', name: 'Producto', barcode: null, unit: 'UN', tracksLots: false, packagings: [], stocks: [{ warehouseId: 'w', quantity: 10, updatedAt: new Date(now).toISOString() }], lots: [] }],
  };
}
function memoryStore(): WarehouseStore & { values: Map<string, WarehouseLocalState> } {
  const values = new Map<string, WarehouseLocalState>();
  let active: string | null = null;
  return { values, activeScope: async () => active, activate: async (scope) => { active = scope; }, read: async (scope) => structuredClone(values.get(scope) ?? null), change: async (scope, update) => { const value = update(structuredClone(values.get(scope) ?? null)); values.set(scope, structuredClone(value)); return value; }, remove: async (scope) => { values.delete(scope); if (active === scope) active = null; } };
}
const input = { kind: 'OUT' as const, warehouseId: 'w', productId: 'p', quantity: 2, note: 'Consumo' };
describe('Captura local y sincronización de bodega', () => {
  it('conserva la cola al cerrar y abrir otro cliente con la misma base', async () => {
    const store = memoryStore();
    const transport: WarehouseTransport = { request: async () => bootstrap() };
    const first = new WarehouseClient(store, transport, randomUUID, () => now);
    await first.synchronize(); await first.capture(input);
    const reopened = new WarehouseClient(store, transport, randomUUID, () => now);
    const state = await reopened.current();
    expect(state?.operations).toHaveLength(1);
    expect(state?.operations[0].status).toBe('LOCAL');
    expect(projectedQuantity(state!, 'p', 'w')).toBe(8);
  });
  it('recupera una respuesta perdida con el mismo identificador y sin volver a descontar', async () => {
    const store = memoryStore();
    const applied = new Set<string>();
    let fail = true;
    let stock = 10;
    const transport: WarehouseTransport = { request: async (path, body) => {
      if (path.includes('bootstrap')) { const data = bootstrap(); data.products[0].stocks[0].quantity = stock; return data; }
      const operations = (body as { operations: WarehouseOperation[] }).operations;
      for (const operation of operations) if (!applied.has(operation.id)) { stock -= operation.quantity; applied.add(operation.id); }
      if (fail) { fail = false; throw new Error('La respuesta se perdió'); }
      return { outcomes: operations.map((operation) => ({ id: operation.id, status: 'APPLIED', message: 'Confirmado', confirmedAt: new Date(now).toISOString() })) };
    } };
    const client = new WarehouseClient(store, transport, randomUUID, () => now);
    await client.synchronize(); const captured = await client.capture(input);
    await expect(client.synchronize()).rejects.toThrow('La respuesta se perdió');
    expect((await client.current())?.operations[0].payload.id).toBe(captured.operations[0].payload.id);
    expect((await client.current())?.operations[0].status).toBe('LOCAL');
    const next = await client.synchronize();
    expect(stock).toBe(8); expect(applied.size).toBe(1); expect(next.operations[0].status).toBe('APPLIED');
    expect(projectedQuantity(next, 'p', 'w')).toBe(8);
  });
  it('no envía pendientes de otra cuenta al cambiar la sesión central', async () => {
    const store = memoryStore(); let user = 'one';
    const request = jest.fn(async () => bootstrap(user));
    const client = new WarehouseClient(store, { request }, randomUUID, () => now);
    await client.synchronize(); await client.capture(input); user = 'two'; request.mockClear();
    const next = await client.synchronize();
    expect(next.identity.userId).toBe('two'); expect(next.operations).toHaveLength(0);
    expect(request.mock.calls).toHaveLength(2);
    expect(store.values.get('company:one')?.operations).toHaveLength(1);
  });
  it('publica el catálogo solo cuando están todas las páginas y agrega órdenes por ítem', async () => {
    const store = memoryStore();
    const a = bootstrap(); a.nextCursor = 'p'; a.orders = [{ id: 'oc', folio: 1, supplier: 'Proveedor', items: [{ id: 'item-a', productId: 'p', description: 'A', remaining: 2 }] }];
    const b = bootstrap(); b.products[0].id = 'p2'; b.orders = [{ ...a.orders[0], items: [{ id: 'item-b', productId: 'p2', description: 'B', remaining: 3 }] }];
    const client = new WarehouseClient(store, { request: async (path) => path.includes('?cursor=') ? b : a }, randomUUID, () => now);
    const next = await client.synchronize(); expect(next.products).toHaveLength(2); expect(next.orders[0].items).toHaveLength(2);
  });
  it('no reemplaza un catálogo completo por una descarga interrumpida', async () => {
    const store = memoryStore(); let fail = false;
    const transport: WarehouseTransport = { request: async (path) => { if (path.includes('?cursor=')) throw new Error('Sin señal'); const data = bootstrap(); if (fail) data.nextCursor = 'next'; return data; } };
    const client = new WarehouseClient(store, transport, randomUUID, () => now);
    await client.synchronize(); fail = true;
    await expect(client.synchronize()).rejects.toThrow('Sin señal');
    expect((await store.read('company:user'))?.products).toHaveLength(1);
  });
  it('bloquea una salida por encima de lo disponible localmente, incluidas otras salidas pendientes', async () => {
    const client = new WarehouseClient(memoryStore(), { request: async () => bootstrap() }, randomUUID, () => now);
    await client.synchronize(); await client.capture({ ...input, quantity: 8 });
    await expect(client.capture({ ...input, quantity: 3 })).rejects.toThrow('supera las existencias');
  });
  it('preserva pendientes cuando vence la sesión e impide prolongarla atrasando el reloj', async () => {
    const store = memoryStore(); const client = new WarehouseClient(store, { request: async () => bootstrap() }, randomUUID, () => now);
    await client.synchronize(); const state = await client.capture(input);
    expect(() => assertOfflineAccess(state, now + 3600001)).toThrow('iniciar sesión');
    expect(() => assertOfflineAccess(state, now - 120000)).toThrow('iniciar sesión');
    expect(store.values.get(warehouseScope(state.identity))?.operations).toHaveLength(1);
  });
  it('un conteo pendiente no reemplaza el saldo hasta su aprobación', async () => {
    const client = new WarehouseClient(memoryStore(), { request: async () => bootstrap() }, randomUUID, () => now);
    await client.synchronize();
    const state = await client.capture({ ...input, kind: 'COUNT', quantity: 3, baseline: { stockUpdatedAt: new Date(now).toISOString() } });
    expect(projectedQuantity(state, 'p', 'w')).toBe(10);
  });
  it('recupera un refresco interrumpido después de confirmar stock y descarga solo el producto afectado', async () => {
    const store = memoryStore();
    let failRefresh = true;
    let committed = false;
    const requested: string[] = [];
    const transport: WarehouseTransport = { request: async (path, body) => {
      requested.push(path);
      if (path.includes('/sync')) {
        committed = true;
        return { outcomes: (body as { operations: WarehouseOperation[] }).operations.map((operation) => ({ id: operation.id, status: 'APPLIED', confirmedAt: new Date(now).toISOString(), message: 'Confirmado' })) };
      }
      if (path.includes('?ids=') && failRefresh) { failRefresh = false; throw new Error('Se perdió la conexión'); }
      const data = bootstrap(); data.products[0].stocks[0].quantity = committed ? 8 : 10; return data;
    } };
    const client = new WarehouseClient(store, transport, randomUUID, () => now);
    await client.synchronize(); await client.capture(input); requested.length = 0;
    await expect(client.synchronize(false)).rejects.toThrow('Se perdió la conexión');
    expect((await store.read('company:user'))?.dirtyProductIds).toEqual(['p']);
    const recovered = await client.synchronize(false);
    expect(projectedQuantity(recovered, 'p', 'w')).toBe(8);
    expect(recovered.dirtyProductIds).toEqual([]);
    expect(requested.filter((path) => path.includes('?ids=p'))).toHaveLength(2);
    expect(requested.filter((path) => path === '/api/warehouse/bootstrap')).toHaveLength(0);
  });
  it('bloquea el acceso local al cerrar sesión y conserva los pendientes para la misma cuenta', async () => {
    const store = memoryStore();
    const client = new WarehouseClient(store, { request: async () => bootstrap() }, randomUUID, () => now);
    await client.synchronize(); await client.capture(input); await client.lock();
    await expect(client.current()).rejects.toThrow('iniciar sesión');
    expect(store.values.get('company:user')?.operations[0].status).toBe('LOCAL');
  });
});

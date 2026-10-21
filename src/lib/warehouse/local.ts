import {
  OFFLINE_SESSION_MS, WAREHOUSE_PROTOCOL, operationOutcomeSchema, roundQuantity,
  warehouseBootstrapSchema, warehouseOperationSchema, warehouseScope,
  type LocalOperation, type OperationOutcome, type WarehouseBootstrap, type WarehouseIdentity, type WarehouseLocalState, type WarehouseOperation, type WarehouseProduct,
} from './contracts';
import { z } from 'zod';

export interface WarehouseStore {
  activeScope(): Promise<string | null>;
  activate(scope: string): Promise<void>;
  read(scope: string): Promise<WarehouseLocalState | null>;
  change(scope: string, update: (previous: WarehouseLocalState | null) => WarehouseLocalState): Promise<WarehouseLocalState>;
  remove(scope: string): Promise<void>;
}
export interface WarehouseTransport { request(path: string, body?: unknown): Promise<unknown> }
export class WarehouseConnectionError extends Error {
  constructor(message: string, public readonly status = 0) { super(message); }
}
const syncResponseSchema = z.object({ outcomes: z.array(operationOutcomeSchema) });

export function assertOfflineAccess(state: WarehouseLocalState, now = Date.now()): void {
  const expires = new Date(state.identity.offlineUntil).getTime();
  // Un reloj que vuelve atrás no puede prolongar el acceso local.
  if (now < state.lastSeenAt - 60_000 || now >= expires || expires - now > OFFLINE_SESSION_MS + 60_000) {
    throw new WarehouseConnectionError('Vuelve a iniciar sesión con conexión. Tus registros pendientes siguen guardados.', 401);
  }
}

export function projectedQuantity(state: WarehouseLocalState, productId: string, warehouseId: string, lotNumber?: string): number {
  const product = state.products.find((row) => row.id === productId);
  let quantity = lotNumber ? product?.lots.find((lot) => lot.warehouseId === warehouseId && lot.lotNumber === lotNumber)?.quantity ?? 0
    : product?.stocks.find((stock) => stock.warehouseId === warehouseId)?.quantity ?? 0;
  for (const { payload, status } of state.operations) {
    if (!['LOCAL', 'REVIEW'].includes(status) || payload.productId !== productId || (lotNumber && payload.lotNumber !== lotNumber)) continue;
    if (payload.kind === 'COUNT') continue; // Un conteo es una observación, no un movimiento aprobado.
    if (payload.warehouseId === warehouseId) quantity += ['OUT', 'TRANSFER'].includes(payload.kind) ? -payload.quantity : payload.quantity;
    if (payload.kind === 'TRANSFER' && payload.targetWarehouseId === warehouseId) quantity += payload.quantity;
  }
  return roundQuantity(quantity);
}

export function applyOutcomes(state: WarehouseLocalState, outcomes: readonly OperationOutcome[]): WarehouseLocalState {
  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const dirty = new Set(state.dirtyProductIds ?? []);
  return { ...state, operations: state.operations.map((operation) => {
    const outcome = byId.get(operation.payload.id);
    if (outcome && outcome.status !== operation.status) dirty.add(operation.payload.productId);
    return outcome ? { ...operation, ...outcome } : operation;
  }), dirtyProductIds: [...dirty] };
}

/** Un solo punto de escritura para navegador y SQLite. La cola y el registro se guardan juntos. */
export class WarehouseClient {
  private running: Promise<WarehouseLocalState> | null = null;
  constructor(private readonly store: WarehouseStore, private readonly transport: WarehouseTransport, private readonly uuid: () => string, private readonly now = () => Date.now()) {}

  async current(): Promise<WarehouseLocalState | null> {
    const scope = await this.store.activeScope();
    if (!scope) return null;
    const state = await this.store.read(scope);
    if (!state) return null;
    assertOfflineAccess(state, this.now());
    return this.store.change(scope, (previous) => ({ ...(previous ?? state), lastSeenAt: Math.max(previous?.lastSeenAt ?? 0, this.now()) }));
  }

  async lock(): Promise<void> {
    const scope = await this.store.activeScope();
    if (!scope) return;
    const current = await this.store.read(scope);
    if (!current) return;
    await this.store.change(scope, (previous) => ({ ...(previous ?? current), identity: { ...(previous ?? current).identity, offlineUntil: new Date(0).toISOString() } }));
  }

  async capture(input: Omit<WarehouseOperation, 'id' | 'deviceId' | 'protocol' | 'capturedAt'>): Promise<WarehouseLocalState> {
    const scope = await this.store.activeScope();
    if (!scope) throw new Error('Conecta con Aether para preparar este dispositivo');
    return this.store.change(scope, (state) => {
      if (!state) throw new Error('Primero descarga los productos de tu bodega');
      assertOfflineAccess(state, this.now());
      if (!state.identity.canOperate || (input.kind === 'RECEIPT' && !state.identity.canReceive)) throw new Error('No tienes permiso para registrar esta operación');
      const parsed = warehouseOperationSchema.safeParse({ ...input, protocol: WAREHOUSE_PROTOCOL, id: this.uuid(), deviceId: state.deviceId, capturedAt: new Date(this.now()).toISOString() });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(issue?.code === 'custom' ? issue.message : issue?.path.includes('quantity') ? 'Ingresa una cantidad válida, con un máximo de seis decimales' : issue?.path.includes('expiryDate') ? 'Revisa el vencimiento; usa una fecha válida' : 'Revisa los datos del registro antes de guardar');
      }
      const payload = parsed.data;
      const product = state.products.find((row) => row.id === payload.productId);
      if (!product || !state.warehouses.some((row) => row.id === payload.warehouseId)) throw new Error('Actualiza el catálogo antes de registrar este producto');
      if (product.tracksLots && !payload.lotNumber) throw new Error('Escanea o indica el lote que estás moviendo');
      if (!product.tracksLots && payload.lotNumber) throw new Error('Este producto no tiene seguimiento por lote');
      if (product.unit === 'UN' && !Number.isInteger(payload.quantity)) throw new Error('Este producto se registra en unidades enteras');
      if (payload.kind === 'RECEIPT') {
        const item = state.orders.find((order) => order.id === payload.orderId)?.items.find((row) => row.id === payload.orderItemId && row.productId === payload.productId);
        const pending = state.operations.filter((row) => ['LOCAL', 'REVIEW'].includes(row.status) && row.payload.kind === 'RECEIPT' && row.payload.orderItemId === payload.orderItemId).reduce((sum, row) => sum + row.payload.quantity, 0);
        if (!item || payload.quantity > roundQuantity(item.remaining - pending) + 1e-6) throw new Error('La cantidad supera lo pendiente de recibir en esta orden. Revisa las cajas o actualiza con conexión.');
      }
      if (['OUT', 'TRANSFER'].includes(payload.kind) && projectedQuantity(state, product.id, payload.warehouseId, payload.lotNumber) < payload.quantity) throw new Error('La cantidad supera las existencias disponibles en este teléfono. Actualiza o revisa el lote.');
      const operation: LocalOperation = { payload, status: 'LOCAL', message: 'Guardado en este teléfono', confirmedAt: null };
      return { ...state, lastSeenAt: this.now(), operations: [...state.operations, operation] };
    });
  }

  async discard(id: string): Promise<WarehouseLocalState> {
    const scope = await this.store.activeScope();
    if (!scope) throw new Error('No hay una bodega preparada');
    return this.store.change(scope, (state) => {
      if (!state) throw new Error('No hay registros locales');
      assertOfflineAccess(state, this.now());
      // Incluso un LOCAL pudo haber confirmado remotamente y perdido su respuesta.
      // Nunca eliminar una intención: el usuario conserva una traza visible.
      const entry = state.operations.find((row) => row.payload.id === id);
      if (!entry || entry.status !== 'CONFLICT') throw new Error('Solo puedes archivar registros que Aether marcó en conflicto');
      return { ...state, operations: state.operations.map((row) => row.payload.id === id ? { ...row, status: 'REJECTED', message: 'Archivado para volver a registrar correctamente' } : row) };
    });
  }

  synchronize(fullRefresh = true): Promise<WarehouseLocalState> {
    if (this.running) return this.running;
    this.running = this.runSync(fullRefresh).finally(() => { this.running = null; });
    return this.running;
  }

  private async runSync(fullRefresh: boolean): Promise<WarehouseLocalState> {
    // Primero autenticar: nunca enviar la cola de la empresa/usuario anterior.
    const first = warehouseBootstrapSchema.parse(await this.transport.request('/api/warehouse/bootstrap?identityOnly=1'));
    const identity = first.identity;
    const scope = warehouseScope(identity);
    let local = await this.store.read(scope);
    const affected = new Set([...(local?.dirtyProductIds ?? []), ...(local?.operations.filter((row) => ['LOCAL', 'REVIEW', 'CONFLICT'].includes(row.status)).map((row) => row.payload.productId) ?? [])]);
    if (local) {
      const ids = local.operations.filter((row) => row.status === 'LOCAL').map((row) => row.payload.id);
      for (let offset = 0; offset < ids.length; offset += 25) {
        const current = await this.store.read(scope);
        if (!current) throw new Error('Los datos locales cambiaron durante la sincronización');
        const wanted = new Set(ids.slice(offset, offset + 25));
        const operations = current.operations.filter((row) => row.status === 'LOCAL' && wanted.has(row.payload.id)).map((row) => row.payload);
        const response = syncResponseSchema.parse(await this.transport.request('/api/warehouse/sync', { expectedScope: scope, operations, checkIds: [] }));
        const returned = new Set(response.outcomes.map((row) => row.id));
        if (operations.some((row) => !returned.has(row.id))) throw new Error('Aether no confirmó todos los registros. Se reintentará sin duplicarlos.');
        local = await this.store.change(scope, (state) => applyOutcomes(state ?? current, response.outcomes));
      }
      const pending = [...new Set([...local.operations.filter((row) => row.status === 'REVIEW' || row.status === 'CONFLICT').map((row) => row.payload.id), ...(fullRefresh ? local.operations.filter((row) => row.status === 'APPLIED').slice(-50).map((row) => row.payload.id) : [])])];
      for (let offset = 0; offset < pending.length; offset += 100) {
        const response = syncResponseSchema.parse(await this.transport.request('/api/warehouse/sync', { expectedScope: scope, operations: [], checkIds: pending.slice(offset, offset + 100) }));
        local = await this.store.change(scope, (state) => {
          if (!state) throw new Error('No se encontraron los registros locales');
          return applyOutcomes(state, response.outcomes);
        });
      }
    }
    // El catálogo inicial fue leído ANTES de confirmar las operaciones. Descargar
    // otra vez evita aplicar un saldo anterior sobre movimientos recién confirmados.
    if (local && !fullRefresh) {
      const changedProducts: WarehouseProduct[] = [];
      const changedOrders = new Map<string, WarehouseBootstrap['orders'][number]>();
      let warehouses = local.warehouses;
      const ids = [...affected];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const page = warehouseBootstrapSchema.parse(await this.transport.request(`/api/warehouse/bootstrap?ids=${ids.slice(offset, offset + 100).map(encodeURIComponent).join(',')}`));
        if (warehouseScope(page.identity) !== scope) throw new WarehouseConnectionError('La sesión cambió. Vuelve a abrir tu bodega.', 401);
        changedProducts.push(...page.products); warehouses = page.warehouses;
        for (const order of page.orders) {
          const previous = changedOrders.get(order.id);
          const items = new Map([...(previous?.items ?? []), ...order.items].map((item) => [item.id, item]));
          changedOrders.set(order.id, { ...order, items: [...items.values()] });
        }
      }
      const state = await this.store.change(scope, (previous) => {
        if (!previous) throw new Error('No se encontraron los registros locales');
        const orders = new Map(previous.orders.map((order) => [order.id, { ...order, items: order.items.filter((item) => !affected.has(item.productId)) }]));
        for (const order of changedOrders.values()) {
          const items = new Map([...(orders.get(order.id)?.items ?? []), ...order.items].map((item) => [item.id, item]));
          orders.set(order.id, { ...order, items: [...items.values()] });
        }
        return { ...previous, identity, warehouses, products: [...previous.products.filter((product) => !affected.has(product.id)), ...changedProducts], orders: [...orders.values()].filter((order) => order.items.length > 0), dirtyProductIds: (previous.dirtyProductIds ?? []).filter((id) => !affected.has(id)), lastSeenAt: this.now() };
      });
      await this.store.activate(scope);
      return state;
    }
    let page = warehouseBootstrapSchema.parse(await this.transport.request('/api/warehouse/bootstrap'));
    const products: WarehouseProduct[] = [];
    const seen = new Set<string>();
    const cursors = new Set<string>();
    const warehouses = page.warehouses;
    const ordersById = new Map<string, typeof page.orders[number]>();
    const finalIdentity: WarehouseIdentity = page.identity;
    while (true) {
      if (warehouseScope(page.identity) !== scope) throw new WarehouseConnectionError('La sesión cambió. Vuelve a abrir tu bodega.', 401);
      for (const order of page.orders) {
        const previous = ordersById.get(order.id);
        const items = new Map([...(previous?.items ?? []), ...order.items].map((item) => [item.id, item]));
        ordersById.set(order.id, { ...order, items: [...items.values()] });
      }
      for (const product of page.products) { if (seen.has(product.id)) throw new Error('El catálogo cambió; vuelve a actualizar'); seen.add(product.id); products.push(product); }
      if (!page.nextCursor) break;
      if (cursors.has(page.nextCursor)) throw new Error('No se pudo completar la descarga del catálogo');
      cursors.add(page.nextCursor);
      page = warehouseBootstrapSchema.parse(await this.transport.request(`/api/warehouse/bootstrap?cursor=${encodeURIComponent(page.nextCursor)}`));
    }
    const state = await this.store.change(scope, (previous) => ({
      version: 1, deviceId: previous?.deviceId ?? this.uuid(), identity: finalIdentity,
      products, warehouses, orders: [...ordersById.values()], operations: previous?.operations ?? [], dirtyProductIds: [], refreshedAt: finalIdentity.serverTime, lastSeenAt: this.now(),
    }));
    await this.store.activate(scope);
    return state;
  }
}

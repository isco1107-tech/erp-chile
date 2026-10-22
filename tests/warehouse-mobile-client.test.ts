import {
  addCode,
  addPhoto,
  addProduct,
  canCreateInMode,
  clampQuantity,
  confirmLine,
  emptyDraft,
  mergeDuplicates,
  newProductFormFrom,
  parseDecimal,
  parseMoney,
  removeLine,
  resolveWithProduct,
  setQuantity,
  setSource,
  summarizeDraft,
  toOperations,
  validateDraft,
  type Draft,
} from '@/lib/warehouse-mobile/draft';
import { createMemoryDb } from '@/lib/warehouse-mobile/client/idb';
import { createBodegaStore } from '@/lib/warehouse-mobile/client/store';
import { runSyncPass } from '@/lib/warehouse-mobile/client/sync-engine';
import { MAX_NETWORK_ATTEMPTS, runIdentifyPass } from '@/lib/warehouse-mobile/client/identify-engine';
import type { ApiResponse, BodegaApi } from '@/lib/warehouse-mobile/client/api';
import { createOutboxEntry, type OutboxEntry } from '@/lib/warehouse-mobile/outbox';
import { syncOperationSchema, type SyncOperation } from '@/modules/warehouse-mobile/schema';
import type { IdentifyResponse, LookupResponse, MobileCandidate, MobileProduct, OpResult, SyncResponse } from '@/modules/warehouse-mobile/types';

const NOW = 1_800_000_000_000;

const aceite: MobileProduct = { id: 'p-aceite', sku: 'ACE-900', name: 'Aceite Maravilla Chef 900 ml', brand: 'Chef', unit: 'UN', barcode: '4006381333931', imageUrl: null, tracksLots: false, isActive: true, stock: 10, totalStock: 10 };
const harina: MobileProduct = { id: 'p-harina', sku: 'HAR-1', name: 'Harina Selecta 1 kg', brand: 'Selecta', unit: 'KG', barcode: null, imageUrl: null, tracksLots: false, isActive: true, stock: 4, totalStock: 4 };

const candidate = (product: MobileProduct, overrides: Partial<MobileCandidate> = {}): MobileCandidate => ({ ...product, reason: 'text', score: 0.9, factor: 1, packagingName: null, ...overrides });

describe('borrador: líneas', () => {
  it('el mismo producto escaneado dos veces suma en una sola línea', () => {
    let draft = emptyDraft('RECEIVE', 'w1');
    draft = addProduct(draft, aceite, { id: 'l1', now: NOW });
    draft = addProduct(draft, aceite, { id: 'l2', now: NOW + 1, quantity: 2 });
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({ id: 'l1', quantity: 3 });
  });

  it('un producto con lote propio NO se junta con el de otro lote', () => {
    const base = addProduct(emptyDraft('RECEIVE', 'w1'), aceite, { id: 'l1', now: NOW });
    const withLot = { ...base, lines: [{ ...base.lines[0]!, lotNumber: 'L1' }] };
    const draft = addProduct(withLot, aceite, { id: 'l2', now: NOW });
    expect(draft.lines).toHaveLength(2);
  });

  it('las cantidades se limitan y respetan si el producto admite decimales', () => {
    expect(clampQuantity(2.6, 'UN')).toBe(3);
    expect(clampQuantity(2.6, 'KG')).toBe(2.6);
    expect(clampQuantity(1.23456, 'KG')).toBe(1.235);
    expect(clampQuantity(-4)).toBe(0);
    expect(clampQuantity(9e9)).toBe(1_000_000);
    expect(clampQuantity(Number.NaN)).toBe(0);
  });

  it('un código repetido que aún no se reconoce suma a la misma línea', () => {
    let draft = addCode(emptyDraft('RECEIVE', 'w1'), '7801234567890', { id: 'c1', now: NOW });
    draft = addCode(draft, '7801234567890', { id: 'c2', now: NOW + 5 });
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]!.quantity).toBe(2);
  });

  it('al reconocer un código de caja (x12) la línea suma 12 unidades por lectura', () => {
    let draft = addCode(emptyDraft('RECEIVE', 'w1'), '7800000000012', { id: 'c1', now: NOW });
    draft = setQuantity(draft, 'c1', 2);
    draft = resolveWithProduct(draft, 'c1', aceite, { confirmed: true, origin: 'code', factor: 12 });
    expect(draft.lines[0]).toMatchObject({ quantity: 24, source: { kind: 'product', confirmed: true } });
  });

  it('resolver una línea hacia un producto que ya estaba junta las cantidades', () => {
    let draft = addProduct(emptyDraft('RECEIVE', 'w1'), aceite, { id: 'l1', now: NOW, quantity: 5 });
    draft = addPhoto(draft, 'foto-1', { id: 'f1', now: NOW });
    draft = resolveWithProduct(draft, 'f1', aceite, { confirmed: true, origin: 'manual' });
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]!.quantity).toBe(6);
  });

  it('un producto sugerido por la IA bloquea el envío hasta que la persona lo confirme', () => {
    let draft = addPhoto(emptyDraft('RECEIVE', 'w1'), 'foto-1', { id: 'f1', now: NOW });
    draft = resolveWithProduct(draft, 'f1', aceite, { confirmed: false, origin: 'ai' });
    expect(validateDraft(draft, { canCreateProduct: true }).map((p) => p.message)).toEqual(['Confirma que "Aceite Maravilla Chef 900 ml" es el producto correcto.']);
    draft = confirmLine(draft, 'f1');
    expect(validateDraft(draft, { canCreateProduct: true })).toEqual([]);
  });

  it('quita líneas y resume el estado del borrador', () => {
    let draft = addProduct(emptyDraft('RECEIVE', 'w1'), aceite, { id: 'l1', now: NOW });
    draft = addPhoto(draft, 'foto-1', { id: 'f1', now: NOW });
    draft = addPhoto(draft, 'foto-2', { id: 'f2', now: NOW });
    draft = setSource(draft, 'f2', { kind: 'resolve', reason: 'candidates', candidates: [], read: null, photoId: 'foto-2', code: null, message: null });
    expect(summarizeDraft(draft)).toEqual({ total: 3, ready: 1, identifying: 1, needsYou: 1 });
    expect(removeLine(draft, 'f1').lines.map((l) => l.id)).toEqual(['l1', 'f2']);
  });

  it('mergeDuplicates conserva el orden de la primera aparición', () => {
    const lines = [
      addProduct(emptyDraft('RECEIVE', 'w'), aceite, { id: 'a', now: NOW }).lines[0]!,
      addProduct(emptyDraft('RECEIVE', 'w'), harina, { id: 'b', now: NOW }).lines[0]!,
      addProduct(emptyDraft('RECEIVE', 'w'), aceite, { id: 'c', now: NOW }).lines[0]!,
    ];
    expect(mergeDuplicates(lines).map((l) => [l.id, l.quantity])).toEqual([['a', 2], ['b', 1]]);
  });
});

describe('borrador: validación', () => {
  const ok = { canCreateProduct: true };

  it('pide lo que falta según el modo', () => {
    const empty = emptyDraft('WASTE', 'w1');
    expect(validateDraft(empty, ok).map((p) => p.message)).toEqual(['Agrega al menos un producto.', 'Indica el motivo de la merma.']);

    const transfer = addProduct(emptyDraft('TRANSFER', 'w1'), aceite, { id: 'l1', now: NOW });
    expect(validateDraft(transfer, ok).map((p) => p.message)).toEqual(['Elige la bodega de destino.']);
    expect(validateDraft({ ...transfer, targetWarehouseId: 'w1' }, ok).map((p) => p.message)).toEqual(['La bodega de destino debe ser distinta de la de origen.']);
    expect(validateDraft({ ...transfer, targetWarehouseId: 'w2' }, ok)).toEqual([]);
  });

  it('una línea que aún se identifica o espera decisión impide enviar', () => {
    let draft = addCode(emptyDraft('RECEIVE', 'w1'), '123456', { id: 'c1', now: NOW });
    expect(validateDraft(draft, ok)[0]).toMatchObject({ lineId: 'c1' });
    draft = setSource(draft, 'c1', { kind: 'resolve', reason: 'unknown-code', candidates: [], read: null, photoId: null, code: '123456', message: null });
    expect(validateDraft(draft, ok)[0]!.message).toContain('Elige qué producto es');
  });

  it('crear un producto nuevo solo se permite en llegada o sobrante, y con permiso', () => {
    const form = { ...newProductFormFrom({}), name: 'Producto nuevo' };
    const build = (mode: Draft['mode']): Draft => {
      const base = addPhoto(emptyDraft(mode, 'w1'), 'foto', { id: 'n1', now: NOW });
      return setSource({ ...base, reason: 'DAMAGED' }, 'n1', { kind: 'new', form, photoId: 'foto' });
    };
    expect(canCreateInMode('RECEIVE')).toBe(true);
    expect(canCreateInMode('WASTE')).toBe(false);
    expect(validateDraft(build('RECEIVE'), ok)).toEqual([]);
    expect(validateDraft(build('SURPLUS'), ok)).toEqual([]);
    expect(validateDraft(build('WASTE'), ok)[0]!.message).toContain('Llegada de mercadería');
    expect(validateDraft(build('RECEIVE'), { canCreateProduct: false })[0]!.message).toContain('no puede crear productos');
    const unnamed = setSource(build('RECEIVE'), 'n1', { kind: 'new', form: { ...form, name: ' ' }, photoId: null });
    expect(validateDraft(unnamed, ok)[0]!.message).toBe('Ponle un nombre al producto nuevo.');
  });

  it('un costo escrito que no es número se señala', () => {
    let draft = addProduct(emptyDraft('RECEIVE', 'w1'), aceite, { id: 'l1', now: NOW });
    draft = { ...draft, lines: [{ ...draft.lines[0]!, unitCost: 'mucho' }] };
    expect(validateDraft(draft, ok)[0]!.message).toBe('El costo no es un número válido.');
  });

  it('entiende los números como los escribe la gente', () => {
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('1234.5')).toBe(1234.5);
    expect(parseDecimal('  900 ')).toBe(900);
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('abc')).toBeUndefined();
    expect(parseDecimal('-5')).toBeUndefined();
  });

  it('los montos en pesos entienden el punto de miles', () => {
    expect(parseMoney('1.290')).toBe(1290);
    expect(parseMoney('$ 12.500')).toBe(12500);
    expect(parseMoney('1.234.567')).toBe(1234567);
    expect(parseMoney('12,50')).toBe(12.5);
    expect(parseMoney('12.5')).toBe(12.5);
    expect(parseMoney('800')).toBe(800);
    expect(parseMoney('1.290,5')).toBe(1290.5);
    expect(parseMoney('mucho')).toBeUndefined();
    expect(parseMoney('')).toBeUndefined();
  });
});

describe('borrador: operaciones a enviar', () => {
  it('toda operación generada es válida para el servidor', () => {
    let draft = emptyDraft('RECEIVE', 'w1');
    draft = { ...draft, reference: 'GD 4521', note: 'camión 2' };
    draft = addProduct(draft, aceite, { id: 'aaaaaaaa-1', now: NOW, quantity: 6 });
    draft = addPhoto(draft, 'foto-nueva', { id: 'bbbbbbbb-2', now: NOW });
    draft = setSource(draft, 'bbbbbbbb-2', {
      kind: 'new',
      photoId: 'foto-nueva',
      form: { ...newProductFormFrom({ code: '7801234567890' }), name: 'Fideos Espagueti Carozzi 400 g', brand: 'Carozzi', netPrice: '1.290', unitCost: '800', categoryName: 'Abarrotes' },
    });
    draft = setQuantity(draft, 'bbbbbbbb-2', 12);

    const { ops, photos } = toOperations(draft);
    expect(ops).toHaveLength(2);
    for (const op of ops) expect(syncOperationSchema.safeParse(op).success).toBe(true);

    expect(ops[0]).toMatchObject({ kind: 'MOVE', mode: 'RECEIVE', clientOpId: 'aaaaaaaa-1', productId: 'p-aceite', quantity: 6, reference: 'GD 4521', note: 'camión 2' });
    expect(ops[1]).toMatchObject({
      kind: 'CREATE_PRODUCT',
      clientOpId: 'bbbbbbbb-2',
      quantity: 12,
      unitCost: 800,
      product: { name: 'Fideos Espagueti Carozzi 400 g', barcode: '7801234567890', netPrice: 1290, categoryName: 'Abarrotes', unit: 'UN' },
    });
    expect(photos).toEqual({ 'bbbbbbbb-2': 'foto-nueva' });
  });

  it('la merma lleva su motivo; el traslado, su destino; la salida no lleva costo ni referencia', () => {
    let waste = addProduct(emptyDraft('WASTE', 'w1'), aceite, { id: 'wwwwwwww-1', now: NOW, quantity: 2 });
    waste = { ...waste, reason: 'EXPIRED', reference: 'no aplica' };
    waste = { ...waste, lines: [{ ...waste.lines[0]!, unitCost: '500' }] };
    const [wasteOp] = toOperations(waste).ops;
    expect(wasteOp).toMatchObject({ kind: 'MOVE', mode: 'WASTE', reason: 'EXPIRED' });
    expect(wasteOp).not.toHaveProperty('unitCost');
    expect(wasteOp).not.toHaveProperty('reference');
    expect(syncOperationSchema.safeParse(wasteOp).success).toBe(true);

    const transfer = { ...addProduct(emptyDraft('TRANSFER', 'w1'), harina, { id: 'tttttttt-1', now: NOW, quantity: 2.5 }), targetWarehouseId: 'w2' };
    const [transferOp] = toOperations(transfer).ops;
    expect(transferOp).toMatchObject({ mode: 'TRANSFER', targetWarehouseId: 'w2', quantity: 2.5 });
    expect(syncOperationSchema.safeParse(transferOp).success).toBe(true);
  });

  it('la clave de cada operación es el id de su línea (reenviar nunca duplica)', () => {
    const draft = addProduct(emptyDraft('RECEIVE', 'w1'), aceite, { id: 'cccccccc-1', now: NOW });
    expect(toOperations(draft).ops.map((op) => op.clientOpId)).toEqual(['cccccccc-1']);
    expect(toOperations(draft).ops[0]).toEqual(toOperations(draft).ops[0]);
  });

  it('el formulario de producto nuevo se prellena con lo leído y es editable', () => {
    const form = newProductFormFrom({
      read: { name: 'Aceite de Maravilla', brand: 'Chef', variant: null, netContent: '900 ml', unit: 'UN', barcode: '4006381333931', description: 'Aceite vegetal', categoryHint: 'Abarrotes', lotNumber: 'L1', expiryDate: '2027-01-01', confidence: 'high', warnings: [] },
    });
    expect(form).toMatchObject({ name: 'Aceite de Maravilla Chef 900 ml', brand: 'Chef', barcode: '4006381333931', categoryName: 'Abarrotes', tracksLots: true, sku: '' });
    expect(newProductFormFrom({ code: '7800000000017' })).toMatchObject({ name: '', barcode: '7800000000017', unit: 'UN' });
  });
});

// ─── Motores ────────────────────────────────────────────────────────────────

function fakeApi(overrides: Partial<BodegaApi> = {}): jest.Mocked<BodegaApi> {
  const unexpected = async () => {
    throw new Error('Llamada inesperada');
  };
  return {
    bootstrap: jest.fn(unexpected),
    lookupCode: jest.fn(unexpected),
    search: jest.fn(unexpected),
    identify: jest.fn(unexpected),
    uploadPhoto: jest.fn(unexpected),
    sync: jest.fn(unexpected),
    recent: jest.fn(unexpected),
    ...overrides,
  } as jest.Mocked<BodegaApi>;
}

const okResponse = <T,>(data: T): ApiResponse<T> => ({ ok: true, data });
const offline = (message = 'Sin conexión'): ApiResponse<never> => ({ ok: false, failure: { kind: 'offline', message } });

describe('motor de envío', () => {
  const move = (id: string, quantity = 1): SyncOperation => ({ kind: 'MOVE', clientOpId: id, mode: 'RECEIVE', productId: 'p1', warehouseId: 'w1', quantity });
  const applied = (op: SyncOperation): OpResult => ({
    clientOpId: op.clientOpId,
    status: 'APPLIED',
    kind: op.kind,
    mode: op.mode,
    productId: 'p1',
    sku: 'S',
    name: 'Producto',
    unit: 'UN',
    quantity: op.quantity,
    warehouseId: 'w1',
    newStock: 5,
    createdProduct: op.kind === 'CREATE_PRODUCT',
    mergedIntoExisting: false,
    replayed: false,
  });

  async function setup(entries: OutboxEntry[]) {
    const store = createBodegaStore(createMemoryDb());
    for (const entry of entries) await store.saveOutboxEntry(entry);
    return store;
  }

  it('envía lo pendiente en un solo lote y deja todo aplicado', async () => {
    const entries = ['op-aaaaaaaa', 'op-bbbbbbbb'].map((id) => createOutboxEntry(move(id), NOW));
    const store = await setup(entries);
    const api = fakeApi({ sync: jest.fn(async (ops) => okResponse<SyncResponse>({ results: ops.map(applied) })) });

    const pass = await runSyncPass(entries, { api, store, now: () => NOW, maxBatch: 25 });
    expect(api.sync).toHaveBeenCalledTimes(1);
    expect(pass.entries.map((e) => e.status)).toEqual(['done', 'done']);
    expect(pass.applied).toHaveLength(2);
    expect((await store.loadOutbox()).every((e) => e.status === 'done')).toBe(true);
  });

  it('sin señal la operación NO se pierde: vuelve a la cola con la misma clave y espera', async () => {
    const entries = [createOutboxEntry(move('op-aaaaaaaa'), NOW)];
    const store = await setup(entries);
    const api = fakeApi({ sync: jest.fn(async () => offline()) });

    const pass = await runSyncPass(entries, { api, store, now: () => NOW, random: () => 0.5, maxBatch: 25 });
    expect(pass.entries[0]).toMatchObject({ id: 'op-aaaaaaaa', status: 'queued', attempts: 1, nextAttemptAt: NOW + 2000, lastError: 'Sin conexión' });
    expect(pass.wakeAt).toBe(NOW + 2000);
    expect((await store.loadOutbox())[0]).toMatchObject({ status: 'queued', attempts: 1 });

    // Todavía no toca: un segundo pase inmediato no vuelve a enviar.
    const again = await runSyncPass(pass.entries, { api, store, now: () => NOW + 100, maxBatch: 25 });
    expect(again.worked).toBe(false);
    expect(api.sync).toHaveBeenCalledTimes(1);

    // Cuando vuelve la señal y toca el reintento, se envía con la misma clave.
    api.sync.mockImplementation(async (ops) => okResponse<SyncResponse>({ results: ops.map(applied) }));
    const retried = await runSyncPass(again.entries, { api, store, now: () => NOW + 2001, maxBatch: 25 });
    expect(retried.entries[0]).toMatchObject({ status: 'done', id: 'op-aaaaaaaa' });
    expect(api.sync.mock.calls[1]![0]![0]!.clientOpId).toBe('op-aaaaaaaa');
  });

  it('sesión vencida: no cuenta como intento y la cola espera a que la persona vuelva a entrar', async () => {
    const entries = [createOutboxEntry(move('op-aaaaaaaa'), NOW)];
    const store = await setup(entries);
    const api = fakeApi({ sync: jest.fn(async (): Promise<ApiResponse<never>> => ({ ok: false, failure: { kind: 'auth', status: 401, message: 'No autenticado' } })) });

    const pass = await runSyncPass(entries, { api, store, now: () => NOW, maxBatch: 25 });
    expect(pass.auth).toMatchObject({ status: 401 });
    expect(pass.entries[0]).toMatchObject({ status: 'queued', attempts: 0 });
  });

  it('un rechazo de negocio queda a la vista de la persona y no se reintenta solo', async () => {
    const entries = [createOutboxEntry(move('op-aaaaaaaa'), NOW), createOutboxEntry(move('op-bbbbbbbb'), NOW + 1)];
    const store = await setup(entries);
    const api = fakeApi({
      sync: jest.fn(async () =>
        okResponse<SyncResponse>({
          results: [
            { clientOpId: 'op-aaaaaaaa', status: 'REJECTED', code: 'INSUFFICIENT_STOCK', message: 'Stock insuficiente en Central (disponible: 0)' },
            applied(move('op-bbbbbbbb')),
          ],
        })
      ),
    });

    const pass = await runSyncPass(entries, { api, store, now: () => NOW + 10, maxBatch: 25 });
    expect(pass.entries.map((e) => e.status)).toEqual(['rejected', 'done']);
    expect(pass.entries[0]!.lastError).toContain('Stock insuficiente');
    expect(pass.wakeAt).toBeNull();
  });

  it('una operación que el servidor no contestó se reintenta', async () => {
    const entries = [createOutboxEntry(move('op-aaaaaaaa'), NOW)];
    const store = await setup(entries);
    const api = fakeApi({ sync: jest.fn(async () => okResponse<SyncResponse>({ results: [] })) });
    const pass = await runSyncPass(entries, { api, store, now: () => NOW, maxBatch: 25 });
    expect(pass.entries[0]).toMatchObject({ status: 'queued', attempts: 1 });
  });

  it('respeta el tamaño máximo del lote y deja el resto para el siguiente pase', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => createOutboxEntry(move(`op-aaaaaaa${i}`), NOW + i));
    const store = await setup(entries);
    const api = fakeApi({ sync: jest.fn(async (ops) => okResponse<SyncResponse>({ results: ops.map(applied) })) });
    const first = await runSyncPass(entries, { api, store, now: () => NOW + 10, maxBatch: 2 });
    expect(first.entries.map((e) => e.status)).toEqual(['done', 'done', 'queued', 'queued', 'queued']);
    const second = await runSyncPass(first.entries, { api, store, now: () => NOW + 10, maxBatch: 2 });
    expect(second.entries.filter((e) => e.status === 'done')).toHaveLength(4);
  });

  describe('producto nuevo con foto', () => {
    const create: SyncOperation = { kind: 'CREATE_PRODUCT', clientOpId: 'op-nuevo-0001', mode: 'RECEIVE', warehouseId: 'w1', quantity: 3, product: { name: 'Producto nuevo', unit: 'UN' } };

    it('sube la foto primero y envía la operación con la dirección de la foto', async () => {
      const entry = createOutboxEntry(create, NOW, 'foto-1');
      const store = await setup([entry]);
      await store.savePhoto({ id: 'foto-1', blob: new Blob(['x']), width: 10, height: 10, createdAt: NOW });
      const api = fakeApi({
        uploadPhoto: jest.fn(async () => okResponse({ url: 'https://cdn.example.com/products/c1/bodega-op-nuevo-0001.jpg' })),
        sync: jest.fn(async (ops) => okResponse<SyncResponse>({ results: ops.map(applied) })),
      });
      const pass = await runSyncPass([entry], { api, store, now: () => NOW, maxBatch: 25 });
      expect(api.uploadPhoto).toHaveBeenCalledWith(expect.anything(), 'op-nuevo-0001');
      const sent = api.sync.mock.calls[0]![0]![0]!;
      expect(sent.kind === 'CREATE_PRODUCT' && sent.product.imageUrl).toBe('https://cdn.example.com/products/c1/bodega-op-nuevo-0001.jpg');
      expect(pass.entries[0]!.status).toBe('done');
      expect(await store.getPhoto('foto-1')).toBeNull();
    });

    it('si la foto no se puede subir por falta de señal, la operación espera (no se envía sin su foto)', async () => {
      const entry = createOutboxEntry(create, NOW, 'foto-1');
      const store = await setup([entry]);
      await store.savePhoto({ id: 'foto-1', blob: new Blob(['x']), width: 10, height: 10, createdAt: NOW });
      const api = fakeApi({ uploadPhoto: jest.fn(async () => offline()) });
      const pass = await runSyncPass([entry], { api, store, now: () => NOW, maxBatch: 25 });
      expect(api.sync).not.toHaveBeenCalled();
      expect(pass.entries[0]).toMatchObject({ status: 'queued', attempts: 1 });
      expect(await store.getPhoto('foto-1')).not.toBeNull();
    });

    it('si la foto se perdió del teléfono, el producto se crea igual sin ella', async () => {
      const entry = createOutboxEntry(create, NOW, 'foto-perdida');
      const store = await setup([entry]);
      const api = fakeApi({ sync: jest.fn(async (ops) => okResponse<SyncResponse>({ results: ops.map(applied) })) });
      const pass = await runSyncPass([entry], { api, store, now: () => NOW, maxBatch: 25 });
      expect(pass.entries[0]).toMatchObject({ status: 'done', photoId: null });
    });
  });
});

describe('motor de identificación', () => {
  const emptyIdentify = (overrides: Partial<IdentifyResponse>): IdentifyResponse => ({ status: 'new', candidates: [], read: null, cached: false, ...overrides });
  const lookup = (match: MobileCandidate | null): ApiResponse<LookupResponse> => okResponse({ match, results: [] });
  const photos: Record<string, Blob> = { 'foto-1': new Blob(['1']), 'foto-2': new Blob(['2']), 'foto-3': new Blob(['3']) };
  const getPhotoBlob = async (id: string) => photos[id] ?? null;

  const withPhotos = (...ids: string[]): Draft => {
    let draft = emptyDraft('RECEIVE', 'w1');
    ids.forEach((id, i) => {
      draft = addPhoto(draft, id, { id: `line-${i + 1}`, now: NOW + i });
    });
    return draft;
  };

  it('un código conocido se resuelve sin tocar la IA', async () => {
    const draft = addCode(emptyDraft('RECEIVE', 'w1'), '4006381333931', { id: 'c1', now: NOW });
    const api = fakeApi({ lookupCode: jest.fn(async () => lookup(candidate(aceite, { reason: 'barcode', score: 1 }))) });
    const pass = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => NOW });
    expect(pass.draft.lines[0]!.source).toMatchObject({ kind: 'product', confirmed: true, origin: 'code' });
    expect(api.identify).not.toHaveBeenCalled();
  });

  it('un código que no está en el catálogo se le entrega a la persona (puede crearlo)', async () => {
    const draft = addCode(emptyDraft('RECEIVE', 'w1'), '7800000000017', { id: 'c1', now: NOW });
    const api = fakeApi({ lookupCode: jest.fn(async () => lookup(null)) });
    const pass = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => NOW });
    expect(pass.draft.lines[0]!.source).toMatchObject({ kind: 'resolve', reason: 'unknown-code', code: '7800000000017' });
  });

  it('una foto reconocida por texto queda como sugerencia por confirmar; por código de barras, confirmada', async () => {
    const text = await runIdentifyPass(withPhotos('foto-1'), 0, {
      api: fakeApi({ identify: jest.fn(async () => okResponse(emptyIdentify({ status: 'matched', candidates: [candidate(aceite)] }))) }),
      getPhotoBlob,
      now: () => NOW,
    });
    expect(text.draft.lines[0]!.source).toMatchObject({ kind: 'product', confirmed: false, origin: 'ai' });

    const exact = await runIdentifyPass(withPhotos('foto-1'), 0, {
      api: fakeApi({ identify: jest.fn(async () => okResponse(emptyIdentify({ status: 'matched', candidates: [candidate(aceite, { reason: 'barcode', score: 1 })] }))) }),
      getPhotoBlob,
      now: () => NOW,
    });
    expect(exact.draft.lines[0]!.source).toMatchObject({ kind: 'product', confirmed: true, origin: 'code' });
  });

  it('candidatos, producto nuevo y foto ilegible pasan a que la persona decida', async () => {
    for (const status of ['candidates', 'new', 'unreadable', 'unavailable'] as const) {
      const pass = await runIdentifyPass(withPhotos('foto-1'), 0, {
        api: fakeApi({ identify: jest.fn(async () => okResponse(emptyIdentify({ status, candidates: status === 'candidates' ? [candidate(aceite), candidate(harina)] : [] }))) }),
        getPhotoBlob,
        now: () => NOW,
      });
      expect(pass.draft.lines[0]!.source).toMatchObject({ kind: 'resolve', reason: status });
    }
  });

  it('cuando la IA está ocupada, TODAS las fotos esperan lo que pidió el servidor y no se insiste', async () => {
    const draft = withPhotos('foto-1', 'foto-2', 'foto-3');
    const api = fakeApi({ identify: jest.fn(async () => okResponse(emptyIdentify({ status: 'busy', retryAfterMs: 30_000, message: 'IA ocupada' }))) });

    const first = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => NOW, random: () => 0 });
    expect(first.holdUntil).toBe(NOW + 30_000);
    expect(first.draft.lines[0]!.source).toMatchObject({ kind: 'identify', pending: { attempts: 0, nextAttemptAt: NOW + 30_000, message: 'IA ocupada' } });

    // Mientras dura la espera, ninguna otra foto sale hacia la IA.
    const second = await runIdentifyPass(first.draft, first.holdUntil, { api, getPhotoBlob, now: () => NOW + 5_000 });
    expect(second.worked).toBe(false);
    expect(api.identify).toHaveBeenCalledTimes(1);
    expect(second.wakeAt).toBe(NOW + 30_000);

    // Pasado el plazo, se retoma de a una.
    api.identify.mockResolvedValue(okResponse(emptyIdentify({ status: 'matched', candidates: [candidate(aceite, { reason: 'barcode', score: 1 })] })));
    const third = await runIdentifyPass(second.draft, first.holdUntil, { api, getPhotoBlob, now: () => NOW + 30_001 });
    expect(third.worked).toBe(true);
    expect(api.identify).toHaveBeenCalledTimes(2);
    expect(third.draft.lines.filter((l) => l.source.kind === 'identify')).toHaveLength(2);
  });

  it('mientras la IA está ocupada, los códigos igual se reconocen (no usan IA)', async () => {
    let draft = withPhotos('foto-1');
    draft = addCode(draft, '4006381333931', { id: 'c1', now: NOW + 50 });
    const api = fakeApi({ lookupCode: jest.fn(async () => lookup(candidate(aceite, { reason: 'barcode', score: 1 }))) });
    const pass = await runIdentifyPass(draft, NOW + 60_000, { api, getPhotoBlob, now: () => NOW + 100 });
    expect(pass.worked).toBe(true);
    expect(pass.draft.lines.find((l) => l.id === 'c1')!.source.kind).toBe('product');
    expect(api.identify).not.toHaveBeenCalled();
  });

  it('procesa una sola línea por pase y siempre la más antigua primero', async () => {
    const draft = withPhotos('foto-1', 'foto-2');
    const api = fakeApi({ identify: jest.fn(async () => okResponse(emptyIdentify({ status: 'new' }))) });
    const pass = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => NOW + 100 });
    expect(api.identify).toHaveBeenCalledTimes(1);
    expect(pass.draft.lines[0]!.source.kind).toBe('resolve');
    expect(pass.draft.lines[1]!.source.kind).toBe('identify');
  });

  it('sin señal reintenta con espera creciente y, tras varios fracasos, se la entrega a la persona', async () => {
    let draft = withPhotos('foto-1');
    const api = fakeApi({ identify: jest.fn(async () => offline()) });
    let t = NOW;
    for (let attempt = 1; attempt < MAX_NETWORK_ATTEMPTS; attempt++) {
      const pass = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => t, random: () => 0.5 });
      draft = pass.draft;
      expect(draft.lines[0]!.source).toMatchObject({ kind: 'identify', pending: { attempts: attempt } });
      t = pass.wakeAt! + 1;
    }
    const last = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => t, random: () => 0.5 });
    expect(last.draft.lines[0]!.source).toMatchObject({ kind: 'resolve', reason: 'failed' });
  });

  it('sesión vencida: avisa y no cambia la línea', async () => {
    const draft = withPhotos('foto-1');
    const api = fakeApi({ identify: jest.fn(async (): Promise<ApiResponse<never>> => ({ ok: false, failure: { kind: 'auth', status: 401, message: 'No autenticado' } })) });
    const pass = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => NOW });
    expect(pass.auth).toMatchObject({ status: 401 });
    expect(pass.draft.lines[0]!.source.kind).toBe('identify');
  });

  it('si la foto ya no está en el teléfono, pasa a que la persona busque a mano', async () => {
    const draft = withPhotos('foto-perdida');
    const api = fakeApi();
    const pass = await runIdentifyPass(draft, 0, { api, getPhotoBlob, now: () => NOW });
    expect(pass.draft.lines[0]!.source).toMatchObject({ kind: 'resolve', reason: 'failed' });
    expect(api.identify).not.toHaveBeenCalled();
  });
});

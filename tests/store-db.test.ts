/**
 * Tienda en línea contra una base PostgreSQL REAL (mismas reglas de seguridad que
 * `tests/warehouse-mobile-db.test.ts`: solo corre contra una base local cuyo nombre termina en
 * `_test`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/erp_store_test \
 *     npx jest tests/store-db.test.ts
 *
 * Lo que protege: aislamiento entre empresas, que dos compradores no se lleven la última unidad,
 * que un pedido pagado emita la venta del ERP (kardex, cobro) con el MISMO total, que el pago solo
 * se dé por bueno consultando a la pasarela con monto exacto, y que una falla al emitir la venta
 * no pierda la plata recibida.
 */
import type { PrismaClient } from '@prisma/client';

const TEST_URL = process.env.WAREHOUSE_TEST_DATABASE_URL;

function isSafeTestDatabase(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname) && /_test$/.test(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
}

const describeDb = isSafeTestDatabase(TEST_URL) ? describe : describe.skip;

describeDb('tienda en línea contra PostgreSQL', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let checkout: typeof import('@/modules/ecommerce/services/store-checkout.service');
  let publicStore: typeof import('@/modules/ecommerce/services/store-public.service');
  let payments: typeof import('@/modules/ecommerce/services/store-payment.service');
  let orders: typeof import('@/modules/ecommerce/services/store-orders.service');
  let fulfillment: typeof import('@/modules/ecommerce/services/store-fulfillment.service');
  let catalog: typeof import('@/modules/ecommerce/services/store-catalog.service');
  let settingsService: typeof import('@/modules/ecommerce/services/store-settings.service');
  let stock: typeof import('@/modules/ecommerce/services/store-stock.service');
  let encrypt: (value: string) => string;
  let errors: typeof import('@/modules/ecommerce/errors');

  const suffix = Math.random().toString(36).slice(2, 8);
  const ids = { companyA: '', companyB: '', warehouse: '', warehouseB: '', siteA: '', siteB: '', user: '', aceite: '', harina: '', servicio: '', oculto: '', archivado: '', productoB: '' };
  const slugA = `tienda-a-${suffix}`;
  const slugB = `tienda-b-${suffix}`;
  const REGION_RM = 'Región Metropolitana de Santiago';
  const REGION_NORTE = 'Región de Tarapacá';
  /** Las pruebas apartan stock sin liberarlo todo: el aceite parte con mucho para que ninguna se quede sin. */
  const ACEITE_STOCK = 200;
  const actor = () => ({ id: ids.user, name: 'Ana Operaria' });

  let sequence = 0;
  const key = () => `ck_${suffix}${String(++sequence).padStart(12, '0')}`;
  const lineAceite = (quantity = 1) => ({ productId: ids.aceite, quantity });

  const base = (over: Record<string, unknown> = {}) => ({
    idempotencyKey: key(),
    lines: [lineAceite(1)],
    customer: { name: 'Camila Rojas', email: 'camila@correo.cl', phone: '+56 9 1234 5678', rut: '' },
    documentType: 'BOLETA' as const,
    deliveryMethod: 'PICKUP' as const,
    paymentProvider: 'TRANSFER' as const,
    acceptTerms: true as const,
    ...over,
  });

  async function context(slug = slugA) {
    const ctx = await publicStore.resolvePublicStore(slug);
    if (!ctx) throw new Error('La tienda de prueba no se resolvió');
    return ctx;
  }
  async function place(over: Record<string, unknown> = {}) {
    return checkout.createStoreOrder(await context(), base(over) as never);
  }
  const onHand = async (productId: string) => (await prisma.stock.findFirst({ where: { companyId: ids.companyA, productId, warehouseId: ids.warehouse } }))?.quantity ?? 0;
  const setStock = (productId: string, quantity: number) =>
    prisma.stock.upsert({ where: { companyId_productId_warehouseId: { companyId: ids.companyA, productId, warehouseId: ids.warehouse } }, update: { quantity }, create: { companyId: ids.companyA, productId, warehouseId: ids.warehouse, quantity } });
  const available = async (productId: string) => (await stock.getAvailability(ids.companyA, ids.warehouse, [productId])).get(productId)?.available;

  /** Simula las llamadas HTTP a Khipu y Webpay; devuelve lo que se pidió, para comprobar que se consultó de verdad. */
  function mockGateways(handlers: { khipu?: (url: string, init: RequestInit) => unknown; webpay?: (url: string, init: RequestInit) => unknown }) {
    const calls: Array<{ url: string; method: string }> = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, method: init.method ?? 'GET' });
      const handler = url.includes('khipu') ? handlers.khipu : url.includes('transbank') ? handlers.webpay : undefined;
      if (!handler) throw new Error(`fetch no previsto: ${url}`);
      const body = handler(url, init);
      if (body instanceof Response) return body;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch);
    return calls;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.PAYMENTS_ENCRYPTION_KEY = 'clave-de-prueba-de-la-tienda';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    errors = await import('@/modules/ecommerce/errors');
    checkout = await import('@/modules/ecommerce/services/store-checkout.service');
    publicStore = await import('@/modules/ecommerce/services/store-public.service');
    payments = await import('@/modules/ecommerce/services/store-payment.service');
    orders = await import('@/modules/ecommerce/services/store-orders.service');
    fulfillment = await import('@/modules/ecommerce/services/store-fulfillment.service');
    catalog = await import('@/modules/ecommerce/services/store-catalog.service');
    settingsService = await import('@/modules/ecommerce/services/store-settings.service');
    stock = await import('@/modules/ecommerce/services/store-stock.service');
    ({ encryptPaymentCredential: encrypt } = await import('@/lib/payments/crypto'));

    const features = { hasWebSites: true, hasEcommerce: true, hasInventory: true };
    const company = (n: number, name: string, withKhipu: boolean) =>
      prisma.company.create({
        data: { rut: `76${suffix}${n}-${n}`, businessName: name, status: 'ACTIVE', features: { create: features }, settings: { create: withKhipu ? { khipuApiCredential: encrypt('llave-khipu') } : {} } },
      });
    ids.companyA = (await company(1, `Tienda A ${suffix}`, true)).id;
    ids.companyB = (await company(2, `Tienda B ${suffix}`, false)).id;
    ids.warehouse = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Central', code: 'CEN', isDefault: true } })).id;
    ids.warehouseB = (await prisma.warehouse.create({ data: { companyId: ids.companyB, name: 'Bodega B', code: 'B', isDefault: true } })).id;
    ids.user = (await prisma.user.create({ data: { email: `ana-${suffix}@test.cl`, passwordHash: 'x', name: 'Ana Operaria', companyId: ids.companyA, role: 'ADMIN' } })).id;

    const site = (companyId: string, name: string, slug: string) =>
      prisma.webSite.create({ data: { companyId, name, slug, status: 'PUBLISHED', publishedAt: new Date(), publishedBlocks: [], draftBlocks: [] } });
    ids.siteA = (await site(ids.companyA, 'Tienda A', slugA)).id;
    ids.siteB = (await site(ids.companyB, 'Tienda B', slugB)).id;

    await prisma.webSiteStore.create({
      data: {
        companyId: ids.companyA,
        siteId: ids.siteA,
        enabled: true,
        warehouseId: ids.warehouse,
        pickupEnabled: true,
        pickupAddress: 'Av. Alemania 123, Temuco',
        pickupInstructions: 'Lunes a viernes de 9 a 18',
        shippingEnabled: true,
        shippingRates: [
          { id: 'rm', name: 'Despacho Santiago', regions: [REGION_RM], price: 3990, freeOver: 40000, minDays: 1, maxDays: 2, note: '' },
          { id: 'pais', name: 'Despacho a todo Chile', regions: [], price: 5990, freeOver: null, minDays: 3, maxDays: 5, note: '' },
        ],
        paymentMethods: ['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP'],
        bankTransferInfo: 'Banco Estado\nCuenta vista 123456\nTienda A SpA',
        transferHoldHours: 48,
        webpayCommerceCode: '597055555532',
        webpayApiSecret: encrypt('secreto-webpay'),
        webpayProduction: false,
        invoiceEnabled: true,
        minOrderAmount: 0,
      },
    });
    await prisma.webSiteStore.create({
      data: { companyId: ids.companyB, siteId: ids.siteB, enabled: true, warehouseId: ids.warehouseB, pickupEnabled: true, pickupAddress: 'Calle B 1', paymentMethods: ['TRANSFER'], bankTransferInfo: 'Banco B' },
    });

    const product = (companyId: string, sku: string, name: string, extra: Record<string, unknown> = {}) =>
      prisma.product.create({ data: { companyId, sku, name, netPrice: 8395, grossPrice: 9990, costPricePMP: 4000, ...extra } });
    ids.aceite = (await product(ids.companyA, 'ACE-900', 'Aceite Maravilla 900 ml', { brand: 'Chef' })).id;
    ids.harina = (await product(ids.companyA, 'HAR-1KG', 'Harina Selecta 1 kg', { netPrice: 1681, grossPrice: 2000 })).id;
    ids.servicio = (await product(ids.companyA, 'SRV-ARM', 'Servicio de armado', { netPrice: 4202, grossPrice: 5000, isTrackable: false })).id;
    ids.oculto = (await product(ids.companyA, 'OCU-1', 'Producto sin publicar')).id;
    ids.archivado = (await product(ids.companyA, 'ARC-1', 'Producto archivado', { isActive: false })).id;
    ids.productoB = (await product(ids.companyB, 'ACE-900', 'Aceite de la empresa B')).id;

    await prisma.stock.createMany({
      data: [
        { companyId: ids.companyA, productId: ids.aceite, warehouseId: ids.warehouse, quantity: ACEITE_STOCK },
        { companyId: ids.companyA, productId: ids.harina, warehouseId: ids.warehouse, quantity: 3 },
        { companyId: ids.companyA, productId: ids.oculto, warehouseId: ids.warehouse, quantity: 5 },
        { companyId: ids.companyB, productId: ids.productoB, warehouseId: ids.warehouseB, quantity: 9 },
      ],
    });
    const listing = (companyId: string, siteId: string, productId: string, slug: string, published = true, extra: Record<string, unknown> = {}) =>
      prisma.storeProduct.create({ data: { companyId, siteId, productId, slug, published, ...extra } });
    await listing(ids.companyA, ids.siteA, ids.aceite, 'aceite-maravilla', true, { collection: 'Despensa', featured: true, compareAtPrice: 12990 });
    await listing(ids.companyA, ids.siteA, ids.harina, 'harina-selecta', true, { collection: 'Despensa', maxPerOrder: 3 });
    await listing(ids.companyA, ids.siteA, ids.servicio, 'servicio-armado', true, { collection: 'Servicios' });
    await listing(ids.companyA, ids.siteA, ids.oculto, 'producto-oculto', false);
    await listing(ids.companyA, ids.siteA, ids.archivado, 'producto-archivado', true);
    await listing(ids.companyB, ids.siteB, ids.productoB, 'aceite-b', true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (!prisma) return;
    // Orden de borrado: ventas y cobros, pedidos, catálogo, base. Mejor esfuerzo: la base es descartable.
    for (const companyId of [ids.companyA, ids.companyB].filter(Boolean)) {
      try {
        await prisma.payment.deleteMany({ where: { companyId } });
        await prisma.storeOrder.updateMany({ where: { companyId }, data: { salesDocumentId: null } });
        await prisma.storeOrder.deleteMany({ where: { companyId } });
        await prisma.journalEntry?.deleteMany({ where: { companyId } });
        await prisma.salesDocument.deleteMany({ where: { companyId } });
        await prisma.inventoryMovement.deleteMany({ where: { companyId } });
        await prisma.storeProduct.deleteMany({ where: { companyId } });
        await prisma.webSiteStore.deleteMany({ where: { companyId } });
        await prisma.webSite.deleteMany({ where: { companyId } });
        await prisma.stock.deleteMany({ where: { companyId } });
        await prisma.product.deleteMany({ where: { companyId } });
        await prisma.contact.deleteMany({ where: { companyId } });
        await prisma.warehouse.deleteMany({ where: { companyId } });
        await prisma.workflowNotification.deleteMany({ where: { companyId } });
        await prisma.user.deleteMany({ where: { companyId } });
        await prisma.company.delete({ where: { id: companyId } });
      } catch {
        /* la base de pruebas es descartable */
      }
    }
    await prisma.$disconnect();
  });

  // ── Resolución pública ───────────────────────────────────────────────────

  describe('qué tienda ve el público', () => {
    it('resuelve la tienda abierta de un sitio publicado, sin datos de la pasarela', async () => {
      const ctx = await context();
      expect(ctx.companyId).toBe(ids.companyA);
      expect(ctx.settings.paymentProviders).toEqual(['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP']);
      const text = JSON.stringify(ctx);
      expect(text).not.toContain('secreto-webpay');
      expect(text).not.toContain('597055555532');
      expect(text).not.toContain('Cuenta vista 123456'); // los datos bancarios solo se muestran después de pedir
    });

    it.each([
      ['tienda cerrada', async () => prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { enabled: false } }), async () => prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { enabled: true } })],
      ['sitio sin publicar', async () => prisma.webSite.update({ where: { id: ids.siteA }, data: { status: 'DRAFT' } }), async () => prisma.webSite.update({ where: { id: ids.siteA }, data: { status: 'PUBLISHED' } })],
      ['empresa suspendida', async () => prisma.company.update({ where: { id: ids.companyA }, data: { status: 'SUSPENDED' } }), async () => prisma.company.update({ where: { id: ids.companyA }, data: { status: 'ACTIVE' } })],
      ['sin el módulo de tienda', async () => prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasEcommerce: false } }), async () => prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasEcommerce: true } })],
      ['sin bodega', async () => prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { warehouseId: null } }), async () => prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { warehouseId: ids.warehouse } })],
    ])('%s: la tienda deja de existir para el público', async (_name, off, on) => {
      await off();
      try {
        expect(await publicStore.resolvePublicStore(slugA)).toBeNull();
      } finally {
        await on();
      }
      expect(await publicStore.resolvePublicStore(slugA)).not.toBeNull();
    });

    it('un slug inventado o con forma rara no resuelve', async () => {
      expect(await publicStore.resolvePublicStore('no-existe-xyz')).toBeNull();
      expect(await publicStore.resolvePublicStore("'; drop table")).toBeNull();
    });
  });

  // ── Catálogo ─────────────────────────────────────────────────────────────

  describe('catálogo', () => {
    it('solo lista lo publicado y activo de ESTA tienda, con precio con IVA y stock real', async () => {
      const page = await publicStore.listPublicProducts(await context(), {});
      expect(page.products.map((p) => p.slug).sort()).toEqual(['aceite-maravilla', 'harina-selecta', 'servicio-armado']);
      const aceite = page.products.find((p) => p.slug === 'aceite-maravilla')!;
      expect(aceite).toMatchObject({ grossPrice: 9990, compareAtPrice: 12990, available: ACEITE_STOCK, featured: true });
      expect(page.products.find((p) => p.slug === 'servicio-armado')!.available).toBeNull();
      expect(page.collections).toEqual([{ name: 'Despensa', count: 2 }, { name: 'Servicios', count: 1 }]);
      expect(JSON.stringify(page)).not.toContain('Aceite de la empresa B');
      expect(JSON.stringify(page)).not.toContain('costPricePMP');
    });

    it('filtra por colección y por texto', async () => {
      const ctx = await context();
      expect((await publicStore.listPublicProducts(ctx, { collection: 'Servicios' })).products.map((p) => p.slug)).toEqual(['servicio-armado']);
      expect((await publicStore.listPublicProducts(ctx, { q: 'harina' })).products.map((p) => p.slug)).toEqual(['harina-selecta']);
    });

    it('la ficha de un producto de otra tienda o no publicado no existe', async () => {
      const ctx = await context();
      expect(await publicStore.getPublicProduct(ctx, 'aceite-b')).toBeNull();
      expect(await publicStore.getPublicProduct(ctx, 'producto-oculto')).toBeNull();
      expect(await publicStore.getPublicProduct(ctx, 'producto-archivado')).toBeNull();
      expect((await publicStore.getPublicProduct(ctx, 'aceite-maravilla'))?.sku).toBe('ACE-900');
    });

    it('un producto agotado se muestra como agotado, no desaparece', async () => {
      await setStock(ids.harina, 0);
      try {
        const harina = (await publicStore.listPublicProducts(await context(), { q: 'harina' })).products[0]!;
        expect(harina).toMatchObject({ available: 0, stock: { state: 'out', text: 'Agotado' } });
      } finally {
        await setStock(ids.harina, 3);
      }
    });
  });

  // ── Cotización ───────────────────────────────────────────────────────────

  describe('cotización del carrito', () => {
    it('ajusta lo pedido al stock y al tope por pedido, y saca lo que ya no se vende', async () => {
      const quote = await publicStore.quoteCart(await context(), {
        lines: [{ productId: ids.harina, quantity: 8 }, { productId: ids.oculto, quantity: 1 }, { productId: ids.productoB, quantity: 1 }, { productId: 'inventado', quantity: 1 }],
      });
      expect(quote.lines).toHaveLength(1);
      expect(quote.lines[0]).toMatchObject({ productId: ids.harina, quantity: 3, requestedQuantity: 8, problem: 'REDUCED', maxPerOrder: 3 });
      expect(quote.removedProductIds.sort()).toEqual([ids.oculto, ids.productoB, 'inventado'].sort());
    });

    it('ofrece las tarifas de la región elegida y rebaja el despacho gratis sobre el monto', async () => {
      const ctx = await context();
      const rm = await publicStore.quoteCart(ctx, { lines: [lineAceite(1)], region: REGION_RM });
      expect(rm.shippingOptions.map((o) => [o.id, o.price])).toEqual([['rm', 3990], ['pais', 5990]]);
      const grande = await publicStore.quoteCart(ctx, { lines: [lineAceite(5)], region: REGION_RM });
      expect(grande.shippingOptions.find((o) => o.id === 'rm')!.price).toBe(0);
      expect(grande.shippingOptions.find((o) => o.id === 'pais')!.price).toBe(5990);
      const norte = await publicStore.quoteCart(ctx, { lines: [lineAceite(1)], region: REGION_NORTE });
      expect(norte.shippingOptions.map((o) => o.id)).toEqual(['pais']);
      expect((await publicStore.quoteCart(ctx, { lines: [lineAceite(1)] })).shippingOptions).toEqual([]);
    });

    it('el total con despacho es el que se cobrará', async () => {
      const quote = await publicStore.quoteCart(await context(), { lines: [lineAceite(2)], region: REGION_RM, deliveryMethod: 'SHIPPING', shippingRateId: 'rm' });
      expect(quote.pricing).toMatchObject({ subtotal: 19980, shippingTotal: 3990 });
      expect(quote.pricing!.total).toBe(19980 + 3990 + quote.pricing!.rounding);
      expect(quote.ready).toBe(true);
    });

    it('un carrito vacío cotiza sin errores', async () => {
      const quote = await publicStore.quoteCart(await context(), { lines: [] });
      expect(quote).toMatchObject({ lines: [], subtotal: 0, pricing: null, ready: false });
    });
  });

  // ── Crear el pedido ──────────────────────────────────────────────────────

  describe('crear el pedido', () => {
    it('numera el pedido, guarda lo comprado al precio del catálogo y aparta el stock', async () => {
      const before = await available(ids.aceite);
      const created = await place({ lines: [lineAceite(2)] });
      expect(created).toMatchObject({ number: expect.any(Number), paymentProvider: 'TRANSFER', redirectUrl: null, replayed: false });
      expect(created.number).toBeGreaterThanOrEqual(1001);

      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { items: true, reservations: true, events: true } });
      expect(order).toMatchObject({ companyId: ids.companyA, siteId: ids.siteA, status: 'OPEN', paymentStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED', total: 19980, shippingTotal: 0 });
      expect(order.items[0]).toMatchObject({ productId: ids.aceite, quantity: 2, netUnit: 8395, grossUnit: 9990, name: 'Aceite Maravilla 900 ml' });
      expect(order.reservations).toHaveLength(1);
      expect(order.reservations[0]).toMatchObject({ quantity: 2, status: 'ACTIVE', warehouseId: ids.warehouse });
      expect(order.paymentExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
      expect(order.events.map((e) => e.type)).toContain('CREATED');
      // El stock físico NO se mueve hasta que se cobra; lo disponible baja por la reserva.
      expect(await onHand(ids.aceite)).toBe(ACEITE_STOCK);
      expect(await available(ids.aceite)).toBe((before ?? 0) - 2);
    });

    it('los números de pedido son correlativos', async () => {
      const a = await place();
      const b = await place();
      expect(b.number).toBe(a.number + 1);
    });

    it('reintentar el mismo intento devuelve el mismo pedido sin duplicar ni apartar de nuevo', async () => {
      const input = base({ lines: [lineAceite(1)] });
      const ctx = await context();
      const first = await checkout.createStoreOrder(ctx, input as never);
      const reserved = await prisma.storeStockReservation.count({ where: { orderId: first.orderId } });
      const second = await checkout.createStoreOrder(ctx, input as never);
      expect(second).toMatchObject({ orderId: first.orderId, number: first.number, replayed: true });
      expect(await prisma.storeStockReservation.count({ where: { orderId: first.orderId } })).toBe(reserved);
      expect(await prisma.storeOrder.count({ where: { siteId: ids.siteA, idempotencyKey: input.idempotencyKey } })).toBe(1);
    });

    it('dos envíos simultáneos del mismo intento dejan un solo pedido', async () => {
      const input = base({ lines: [lineAceite(1)] });
      const ctx = await context();
      const results = await Promise.allSettled([checkout.createStoreOrder(ctx, input as never), checkout.createStoreOrder(ctx, input as never)]);
      const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof checkout.createStoreOrder>>> => r.status === 'fulfilled');
      expect(ok).toHaveLength(2);
      expect(new Set(ok.map((r) => r.value.orderId)).size).toBe(1);
      expect(await prisma.storeOrder.count({ where: { siteId: ids.siteA, idempotencyKey: input.idempotencyKey } })).toBe(1);
    });

    it('la misma clave con otro carrito no se acepta en silencio', async () => {
      const input = base({ lines: [lineAceite(1)] });
      await checkout.createStoreOrder(await context(), input as never);
      await expect(checkout.createStoreOrder(await context(), { ...input, lines: [lineAceite(3)] } as never)).rejects.toMatchObject({ status: 409 });
    });

    it('sin stock suficiente no queda pedido, ni reserva, ni número gastado', async () => {
      const ordersBefore = await prisma.storeOrder.count({ where: { siteId: ids.siteA } });
      const counterBefore = (await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).orderCounter;
      await expect(place({ lines: [{ productId: ids.harina, quantity: 3 }, lineAceite(500)] })).rejects.toBeInstanceOf(errors.OutOfStockError);
      expect(await prisma.storeOrder.count({ where: { siteId: ids.siteA } })).toBe(ordersBefore);
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).orderCounter).toBe(counterBefore);
      expect(await available(ids.harina)).toBe(3);
    });

    it('dos compradores de la última unidad: solo uno se la lleva', async () => {
      await setStock(ids.harina, 1);
      try {
        const results = await Promise.allSettled([place({ lines: [{ productId: ids.harina, quantity: 1 }] }), place({ lines: [{ productId: ids.harina, quantity: 1 }] }), place({ lines: [{ productId: ids.harina, quantity: 1 }] })]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(rejected).toHaveLength(2);
        for (const r of rejected) expect(r.reason).toBeInstanceOf(errors.OutOfStockError);
        expect(await available(ids.harina)).toBe(0);
      } finally {
        await prisma.storeStockReservation.updateMany({ where: { productId: ids.harina, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
        await setStock(ids.harina, 3);
      }
    });

    it('un producto sin control de stock siempre se puede pedir y no aparta nada', async () => {
      const created = await place({ lines: [{ productId: ids.servicio, quantity: 4 }] });
      expect(await prisma.storeStockReservation.count({ where: { orderId: created.orderId } })).toBe(0);
    });

    it('respeta el tope por pedido, los productos no publicados y los de otra empresa', async () => {
      await expect(place({ lines: [{ productId: ids.harina, quantity: 4 }] })).rejects.toThrow(/hasta 3 por pedido/);
      await expect(place({ lines: [{ productId: ids.oculto, quantity: 1 }] })).rejects.toMatchObject({ status: 409 });
      await expect(place({ lines: [{ productId: ids.productoB, quantity: 1 }] })).rejects.toMatchObject({ status: 409 });
      await expect(place({ lines: [{ productId: ids.archivado, quantity: 1 }] })).rejects.toMatchObject({ status: 409 });
    });

    it('el despacho lo cobra la tarifa de la tienda, no el navegador', async () => {
      const address = { region: REGION_RM, comuna: 'Providencia', street: 'Los Aromos 123', extra: '' };
      const created = await place({ deliveryMethod: 'SHIPPING', address, shippingRateId: 'rm', lines: [lineAceite(1)] });
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(order).toMatchObject({ shippingTotal: 3990, shippingRateId: 'rm', shippingRateName: 'Despacho Santiago', deliveryMethod: 'SHIPPING' });
      expect(order.total).toBe(9990 + 3990 + (order.total - 9990 - 3990));
      expect(order.shippingAddress).toMatchObject(address);
      // Una tarifa que no llega a la región se rechaza.
      await expect(place({ deliveryMethod: 'SHIPPING', address: { ...address, region: REGION_NORTE }, shippingRateId: 'rm' })).rejects.toMatchObject({ field: 'shippingRateId' });
      // Despacho gratis al llegar al monto.
      const free = await place({ deliveryMethod: 'SHIPPING', address, shippingRateId: 'rm', lines: [lineAceite(5)] });
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: free.orderId } })).shippingTotal).toBe(0);
    });

    it('valida medio de pago y entrega contra la configuración', async () => {
      await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { pickupEnabled: false } });
      try {
        await expect(place({ deliveryMethod: 'PICKUP' })).rejects.toMatchObject({ field: 'deliveryMethod' });
      } finally {
        await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { pickupEnabled: true } });
      }
      await expect(place({ paymentProvider: 'PAY_ON_PICKUP', deliveryMethod: 'SHIPPING', address: { region: REGION_RM, comuna: 'Maipú', street: 'Calle 1234', extra: '' }, shippingRateId: 'rm' })).rejects.toMatchObject({ field: 'paymentProvider' });
      await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { invoiceEnabled: false } });
      try {
        await expect(place({ documentType: 'FACTURA', billing: { rut: '76.086.428-5', razonSocial: 'X SpA', giro: 'Comercio', address: 'Calle 1', comuna: 'Temuco' } })).rejects.toMatchObject({ field: 'documentType' });
      } finally {
        await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { invoiceEnabled: true } });
      }
    });

    it('respeta la compra mínima', async () => {
      await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { minOrderAmount: 50000 } });
      try {
        await expect(place({ lines: [lineAceite(1)] })).rejects.toThrow(/compra mínima/);
        expect((await publicStore.quoteCart(await context(), { lines: [lineAceite(1)] })).belowMinimum).toBe(true);
      } finally {
        await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { minOrderAmount: 0 } });
      }
    });
  });

  // ── Cobro manual y venta en el ERP ───────────────────────────────────────

  describe('cobrar un pedido y emitir la venta', () => {
    it('confirmar la transferencia emite la venta: descuenta el kardex, deja el cobro y consume la reserva', async () => {
      const stockBefore = await onHand(ids.aceite);
      const created = await place({ lines: [lineAceite(2), { productId: ids.harina, quantity: 1 }] });
      await payments.confirmManualPayment(ids.companyA, created.orderId, actor(), 'TRANSFERENCIA', 'Transferencia verificada en la cartola');

      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { salesDocument: { include: { items: true, payments: true } }, reservations: true, events: true } });
      expect(order).toMatchObject({ paymentStatus: 'PAID', paymentMethodCode: 'TRANSFERENCIA', documentError: null });
      expect(order.paidAt).not.toBeNull();
      const doc = order.salesDocument!;
      expect(doc).toMatchObject({ status: 'ISSUED', dteType: 'BOLETA_39', totalAmount: order.total, paymentStatus: 'PAID', paymentMethod: 'TRANSFERENCIA', warehouseId: ids.warehouse });
      expect(doc.items.map((i) => [i.productId, i.quantity]).sort()).toEqual([[ids.aceite, 2], [ids.harina, 1]].sort());
      expect(doc.payments).toHaveLength(1);
      expect(doc.payments[0]).toMatchObject({ amount: order.total, type: 'INCOME' });
      expect(doc.idempotencyKey).toBe(`store-order:${order.id}`);
      // El kardex se movió con el mismo código de Ventas.
      expect(await onHand(ids.aceite)).toBe(stockBefore - 2);
      const movements = await prisma.inventoryMovement.findMany({ where: { companyId: ids.companyA, productId: ids.aceite, type: 'SALE_OUT' } });
      expect(movements.length).toBeGreaterThan(0);
      // La reserva se consumió: ya no resta dos veces.
      expect(order.reservations.every((r) => r.status === 'CONSUMED')).toBe(true);
      expect(order.events.map((e) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'PAID', 'SALE_ISSUED']));
      expect(order.events.find((e) => e.type === 'PAID')?.userName).toBe('Ana Operaria');
      // Cliente consumidor final: no se inventó un cliente con datos del comprador.
      const contact = await prisma.contact.findUniqueOrThrow({ where: { id: doc.contactId } });
      expect(contact.rutClean).toBe('666666666');
    });

    it('confirmar dos veces no duplica la venta ni mueve el stock otra vez', async () => {
      const created = await place({ lines: [lineAceite(1)] });
      const before = await onHand(ids.aceite);
      await payments.confirmManualPayment(ids.companyA, created.orderId, actor(), null, '');
      await expect(payments.confirmManualPayment(ids.companyA, created.orderId, actor(), null, '')).rejects.toMatchObject({ status: 409 });
      await Promise.allSettled([payments.markOrderPaid(created.orderId, ids.companyA, { reference: null, method: 'TRANSFERENCIA', source: 'test' }), payments.markOrderPaid(created.orderId, ids.companyA, { reference: null, method: 'TRANSFERENCIA', source: 'test' })]);
      expect(await prisma.salesDocument.count({ where: { companyId: ids.companyA, idempotencyKey: `store-order:${created.orderId}` } })).toBe(1);
      expect(await onHand(ids.aceite)).toBe(before - 1);
    });

    it('con RUT del comprador la venta queda a su nombre; con factura, a nombre de la empresa', async () => {
      const boleta = await place({ customer: { name: 'Camila Rojas', email: 'camila@correo.cl', phone: '+56 9 1234 5678', rut: '12.345.678-5' } });
      await payments.confirmManualPayment(ids.companyA, boleta.orderId, actor(), null, '');
      const doc1 = await prisma.storeOrder.findUniqueOrThrow({ where: { id: boleta.orderId }, include: { salesDocument: { include: { contact: true } } } });
      expect(doc1.salesDocument!.contact).toMatchObject({ rutClean: '123456785', razonSocial: 'Camila Rojas', email: 'camila@correo.cl' });

      const factura = await place({ documentType: 'FACTURA', billing: { rut: '76.086.428-5', razonSocial: 'Mi Empresa SpA', giro: 'Comercio', address: 'Av. Siempre Viva 742', comuna: 'Temuco' } });
      await payments.confirmManualPayment(ids.companyA, factura.orderId, actor(), null, '');
      const doc2 = await prisma.storeOrder.findUniqueOrThrow({ where: { id: factura.orderId }, include: { salesDocument: { include: { contact: true } } } });
      expect(doc2.salesDocument).toMatchObject({ dteType: 'FACTURA_33' });
      expect(doc2.salesDocument!.contact).toMatchObject({ rutClean: '760864285', razonSocial: 'Mi Empresa SpA', giro: 'Comercio' });
    });

    it('un pedido solo de servicios (sin stock) también se cobra y emite', async () => {
      const created = await place({ lines: [{ productId: ids.servicio, quantity: 1 }] });
      await payments.confirmManualPayment(ids.companyA, created.orderId, actor(), 'EFECTIVO', '');
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { salesDocument: true } });
      expect(order.salesDocument).toMatchObject({ status: 'ISSUED', totalAmount: order.total });
    });

    it('si la venta no se puede emitir, el pago queda registrado, el pedido lo dice y un reintento lo resuelve', async () => {
      const created = await place({ lines: [lineAceite(2)] });
      // Otro canal (mostrador) se llevó el stock entre el pedido y el pago.
      await setStock(ids.aceite, 0);
      try {
        await payments.confirmManualPayment(ids.companyA, created.orderId, actor(), null, '');
        const failed = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { events: true } });
        expect(failed).toMatchObject({ paymentStatus: 'PAID', salesDocumentId: null });
        expect(failed.documentError).toMatch(/No se pudo emitir la venta/);
        expect(failed.events.map((e) => e.type)).toContain('SALE_FAILED');
        expect(await prisma.workflowNotification.count({ where: { companyId: ids.companyA, severity: 'CRITICAL', title: { contains: `#${created.number}` } } })).toBeGreaterThan(0);
        const list = await orders.listStoreOrders(ids.companyA, { view: 'attention', page: 1 });
        expect(list.rows.map((r) => r.id)).toContain(created.orderId);

        // Se repone el stock y se reintenta.
        await setStock(ids.aceite, ACEITE_STOCK);
        expect(await payments.retryIssueSale(ids.companyA, created.orderId, actor())).toEqual({ ok: true });
        const fixed = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
        expect(fixed.salesDocumentId).not.toBeNull();
        expect(fixed.documentError).toBeNull();
        expect(await onHand(ids.aceite)).toBe(ACEITE_STOCK - 2);
      } finally {
        await setStock(ids.aceite, ACEITE_STOCK);
      }
    });
  });

  // ── Pasarelas ────────────────────────────────────────────────────────────

  describe('pago en línea (la pasarela siempre se consulta)', () => {
    const khipuPaid = (order: { id: string; total: number }, over: Record<string, unknown> = {}) => ({
      payment_id: 'kp-1', status: 'done', amount: order.total, currency: 'CLP', transaction_id: order.id, ...over,
    });

    it('Khipu: abre el cobro con la llave de la empresa y lleva al comprador a su página de pago', async () => {
      const calls = mockGateways({ khipu: () => ({ payment_id: 'kp-1', payment_url: 'https://khipu.com/payment/kp-1' }) });
      const created = await place({ paymentProvider: 'KHIPU' });
      expect(created.redirectUrl).toBe('https://khipu.com/payment/kp-1');
      expect(calls).toEqual([{ url: expect.stringContaining('/v3/payments'), method: 'POST' }]);
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(order).toMatchObject({ providerPaymentId: 'kp-1', paymentStatus: 'PENDING' });
      expect(order.paymentExpiresAt!.getTime()).toBeLessThan(Date.now() + 61 * 60_000);
    });

    it('Khipu: la notificación no paga nada por sí sola; solo se paga si la consulta confirma monto y referencia exactos', async () => {
      mockGateways({ khipu: () => ({ payment_id: 'kp-2', payment_url: 'https://khipu.com/payment/kp-2' }) });
      const created = await place({ paymentProvider: 'KHIPU' });
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });

      // 1) Aviso falso: Khipu dice que aún no se paga.
      jest.restoreAllMocks();
      mockGateways({ khipu: () => khipuPaid(order, { payment_id: 'kp-2', status: 'pending' }) });
      expect(await payments.handleKhipuNotification('kp-2')).toBe('processed');
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PENDING');

      // 2) Cobro "pagado" pero por otro monto o de otro pedido: no se aplica y queda a la vista.
      for (const wrong of [{ amount: order.total - 1 }, { transaction_id: 'otro-pedido' }, { currency: 'USD' }]) {
        jest.restoreAllMocks();
        mockGateways({ khipu: () => khipuPaid(order, { payment_id: 'kp-2', ...wrong }) });
        await payments.handleKhipuNotification('kp-2');
        expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PENDING');
      }
      expect(await prisma.storeOrderEvent.count({ where: { orderId: order.id, type: 'PAYMENT_MISMATCH' } })).toBe(3);

      // 3) Cobro correcto: ahora sí.
      jest.restoreAllMocks();
      mockGateways({ khipu: () => khipuPaid(order, { payment_id: 'kp-2', bank: 'Banco X' }) });
      await payments.handleKhipuNotification('kp-2');
      const paid = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id }, include: { salesDocument: true } });
      expect(paid).toMatchObject({ paymentStatus: 'PAID', paymentMethodCode: 'TRANSFERENCIA', paymentReference: 'kp-2' });
      expect(paid.salesDocument).toMatchObject({ status: 'ISSUED', totalAmount: order.total });
      // Un segundo aviso no repite nada.
      await payments.handleKhipuNotification('kp-2');
      expect(await prisma.salesDocument.count({ where: { companyId: ids.companyA, idempotencyKey: `store-order:${order.id}` } })).toBe(1);
    });

    it('Khipu: un aviso de un cobro que no es de esta tienda se ignora', async () => {
      expect(await payments.handleKhipuNotification('cobro-que-no-existe')).toBe('unknown');
    });

    it('Webpay: el comprador va por una página puente y al volver se confirma la transacción con Transbank', async () => {
      const calls = mockGateways({ webpay: () => ({ token: 'tok-1', url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' }) });
      const created = await place({ paymentProvider: 'WEBPAY' });
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(created.redirectUrl).toContain(`/api/public/store/webpay/start?o=${order.accessToken}`);
      expect(order).toMatchObject({ providerPaymentId: 'tok-1', paymentUrl: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' });
      expect(calls[0]).toMatchObject({ method: 'POST', url: expect.stringContaining('webpay3gint.transbank.cl') });

      jest.restoreAllMocks();
      const commits = mockGateways({
        webpay: () => ({ status: 'AUTHORIZED', response_code: 0, amount: order.total, buy_order: order.id, authorization_code: '1213', payment_type_code: 'VD' }),
      });
      const target = await payments.handleWebpayReturn({ tokenWs: 'tok-1' });
      expect(target).toContain(`/pedido/${order.accessToken}`);
      expect(commits[0]).toMatchObject({ method: 'PUT', url: expect.stringContaining('/transactions/tok-1') });
      const paid = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id }, include: { salesDocument: true } });
      expect(paid).toMatchObject({ paymentStatus: 'PAID', paymentMethodCode: 'TARJETA_DEBITO' });
      expect(paid.paymentReference).toContain('1213');
      expect(paid.salesDocument).toMatchObject({ status: 'ISSUED', paymentMethod: 'TARJETA_DEBITO' });
    });

    it('Webpay: una transacción rechazada o de otro monto no paga', async () => {
      mockGateways({ webpay: () => ({ token: 'tok-2', url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' }) });
      const created = await place({ paymentProvider: 'WEBPAY' });
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });

      jest.restoreAllMocks();
      mockGateways({ webpay: () => ({ status: 'AUTHORIZED', response_code: 0, amount: order.total - 100, buy_order: order.id }) });
      await payments.handleWebpayReturn({ tokenWs: 'tok-2' });
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PENDING');

      jest.restoreAllMocks();
      mockGateways({ webpay: () => ({ status: 'AUTHORIZED', response_code: 0, amount: order.total, buy_order: 'otro-pedido' }) });
      await payments.handleWebpayReturn({ tokenWs: 'tok-2' });
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PENDING');

      jest.restoreAllMocks();
      mockGateways({ webpay: () => ({ status: 'FAILED', response_code: -1, amount: order.total, buy_order: order.id }) });
      await payments.handleWebpayReturn({ tokenWs: 'tok-2' });
      const failed = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(failed).toMatchObject({ paymentStatus: 'FAILED', status: 'OPEN' });
      expect(await prisma.salesDocument.count({ where: { companyId: ids.companyA, idempotencyKey: `store-order:${order.id}` } })).toBe(0);
    });

    it('Webpay: recargar la página de retorno (la transacción ya estaba confirmada) no rompe ni paga dos veces', async () => {
      mockGateways({ webpay: () => ({ token: 'tok-3', url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' }) });
      const created = await place({ paymentProvider: 'WEBPAY' });
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      jest.restoreAllMocks();
      const ok = { status: 'AUTHORIZED', response_code: 0, amount: order.total, buy_order: order.id, authorization_code: '77', payment_type_code: 'VN' };
      mockGateways({ webpay: (_url, init) => (init.method === 'PUT' ? new Response('ya confirmada', { status: 422 }) : ok) });
      await payments.handleWebpayReturn({ tokenWs: 'tok-3' });
      await payments.handleWebpayReturn({ tokenWs: 'tok-3' });
      const paid = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(paid).toMatchObject({ paymentStatus: 'PAID', paymentMethodCode: 'TARJETA_CREDITO' });
      expect(await prisma.salesDocument.count({ where: { companyId: ids.companyA, idempotencyKey: `store-order:${order.id}` } })).toBe(1);
    });

    it('Webpay: si el comprador anula el pago en Transbank el pedido queda abierto para reintentar', async () => {
      mockGateways({ webpay: () => ({ token: 'tok-4', url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' }) });
      const created = await place({ paymentProvider: 'WEBPAY' });
      await payments.handleWebpayReturn({ tbkToken: 'tok-4' });
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { reservations: true } });
      expect(order).toMatchObject({ status: 'OPEN', paymentStatus: 'FAILED' });
      expect(order.reservations[0]!.status).toBe('ACTIVE');
      // Reintentar abre un cobro nuevo.
      jest.restoreAllMocks();
      mockGateways({ webpay: () => ({ token: 'tok-5', url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' }) });
      expect(await payments.restartOrderPayment(order.accessToken)).toContain('/api/public/store/webpay/start');
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).providerPaymentId).toBe('tok-5');
    });

    it('un retorno con un token que no es de este sistema no hace nada', async () => {
      expect(await payments.handleWebpayReturn({ tokenWs: 'x'.repeat(40) })).toBeNull();
      expect(await payments.handleWebpayReturn({})).toBeNull();
    });

    it('si la pasarela falla al abrir el cobro, el pedido se cancela y el stock vuelve', async () => {
      mockGateways({ khipu: () => new Response('boom', { status: 500 }) });
      const before = await available(ids.aceite);
      const ordersBefore = await prisma.storeOrder.count({ where: { siteId: ids.siteA } });
      await expect(place({ paymentProvider: 'KHIPU', lines: [lineAceite(2)] })).rejects.toMatchObject({ status: 502 });
      expect(await available(ids.aceite)).toBe(before);
      const created = await prisma.storeOrder.findMany({ where: { siteId: ids.siteA }, orderBy: { number: 'desc' }, take: 1 });
      expect(await prisma.storeOrder.count({ where: { siteId: ids.siteA } })).toBe(ordersBefore + 1);
      expect(created[0]).toMatchObject({ status: 'CANCELLED', paymentStatus: 'PENDING' });
    });

    it('un pago que llega con el pedido ya vencido se registra pero NO emite la venta: queda a la vista', async () => {
      mockGateways({ khipu: () => ({ payment_id: 'kp-late', payment_url: 'https://khipu.com/payment/kp-late' }) });
      const created = await place({ paymentProvider: 'KHIPU', lines: [lineAceite(1)] });
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      await prisma.storeOrder.update({ where: { id: order.id }, data: { paymentExpiresAt: new Date(Date.now() - 3 * 3_600_000) } });
      jest.restoreAllMocks();
      mockGateways({ khipu: () => khipuPaid(order, { payment_id: 'kp-late', status: 'pending' }) });
      expect(await payments.expireStaleOrders(ids.companyA)).toBeGreaterThan(0);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('EXPIRED');

      jest.restoreAllMocks();
      mockGateways({ khipu: () => khipuPaid(order, { payment_id: 'kp-late' }) });
      await payments.handleKhipuNotification('kp-late');
      const late = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(late).toMatchObject({ status: 'EXPIRED', paymentStatus: 'PAID', salesDocumentId: null });
      expect(late.documentError).toMatch(/ya estaba cerrado/);
      expect((await orders.listStoreOrders(ids.companyA, { view: 'attention', page: 1 })).rows.map((r) => r.id)).toContain(order.id);

      // El equipo lo reabre: se vuelve a apartar el stock y se emite la venta.
      await payments.reopenPaidOrder(ids.companyA, order.id, actor());
      const reopened = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(reopened).toMatchObject({ status: 'OPEN', documentError: null });
      expect(reopened.salesDocumentId).not.toBeNull();
    });
  });

  // ── Vencimiento ──────────────────────────────────────────────────────────

  describe('reservas que vencen', () => {
    it('una reserva vencida no cuenta como apartada, aunque nadie haya ordenado el pedido todavía', async () => {
      const created = await place({ lines: [lineAceite(4)] });
      const before = (await available(ids.aceite))!;
      await prisma.storeStockReservation.updateMany({ where: { orderId: created.orderId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      expect(await available(ids.aceite)).toBe(before + 4);
    });

    it('expirar los pedidos sin pagar los cierra y libera lo apartado; no toca los pagados ni los vigentes', async () => {
      const stale = await place({ lines: [lineAceite(1)] });
      const fresh = await place({ lines: [lineAceite(1)] });
      const paid = await place({ lines: [lineAceite(1)] });
      await payments.confirmManualPayment(ids.companyA, paid.orderId, actor(), null, '');
      await prisma.storeOrder.update({ where: { id: stale.orderId }, data: { paymentExpiresAt: new Date(Date.now() - 3_600_000) } });
      await payments.expireStaleOrders(ids.companyA);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: stale.orderId }, include: { reservations: true } }))).toMatchObject({ status: 'EXPIRED', reservations: [expect.objectContaining({ status: 'RELEASED' })] });
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: fresh.orderId } })).status).toBe('OPEN');
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: paid.orderId } })).status).toBe('OPEN');
    });
  });

  // ── Entrega y cancelación ────────────────────────────────────────────────

  describe('entrega y cancelación', () => {
    it('avanza preparar → listo para retirar → entregado, con historial, y no deja saltar pasos', async () => {
      const created = await place({ lines: [lineAceite(1)] });
      await expect(fulfillment.applyFulfillment(ids.companyA, created.orderId, { action: 'PREPARE', carrier: '', trackingNumber: '', trackingUrl: '' }, actor())).rejects.toThrow(/confirma el pago/);
      await payments.confirmManualPayment(ids.companyA, created.orderId, actor(), null, '');
      const apply = (action: 'PREPARE' | 'READY_FOR_PICKUP' | 'SHIP' | 'DELIVER') => fulfillment.applyFulfillment(ids.companyA, created.orderId, { action, carrier: '', trackingNumber: '', trackingUrl: '' }, actor());
      await expect(apply('DELIVER')).rejects.toMatchObject({ status: 409 });
      await expect(apply('SHIP')).rejects.toThrow(/retiro/);
      await apply('PREPARE');
      await expect(apply('PREPARE')).rejects.toMatchObject({ status: 409 });
      await apply('READY_FOR_PICKUP');
      await apply('DELIVER');
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { events: true } });
      expect(order.fulfillmentStatus).toBe('DELIVERED');
      expect(order.deliveredAt).not.toBeNull();
      expect(order.events.map((e) => e.type)).toEqual(expect.arrayContaining(['PREPARE', 'READY_FOR_PICKUP', 'DELIVER']));
    });

    it('despachar guarda transportista y seguimiento, y solo acepta enlaces https', async () => {
      const address = { region: REGION_RM, comuna: 'Ñuñoa', street: 'Av. Grecia 1000', extra: 'Depto 12' };
      const created = await place({ deliveryMethod: 'SHIPPING', address, shippingRateId: 'rm' });
      await payments.confirmManualPayment(ids.companyA, created.orderId, actor(), null, '');
      await expect(fulfillment.applyFulfillment(ids.companyA, created.orderId, { action: 'SHIP', carrier: 'Starken', trackingNumber: 'ABC123', trackingUrl: 'javascript:alert(1)' }, actor())).rejects.toMatchObject({ field: 'trackingUrl' });
      await fulfillment.applyFulfillment(ids.companyA, created.orderId, { action: 'SHIP', carrier: 'Starken', trackingNumber: 'ABC123', trackingUrl: 'https://www.starken.cl/seguimiento?codigo=ABC123' }, actor());
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(order).toMatchObject({ fulfillmentStatus: 'SHIPPED', carrier: 'Starken', trackingNumber: 'ABC123', trackingUrl: 'https://www.starken.cl/seguimiento?codigo=ABC123' });
      expect(order.shippedAt).not.toBeNull();
    });

    it('cancelar un pedido sin pagar libera el stock', async () => {
      const created = await place({ lines: [lineAceite(3)] });
      const held = (await available(ids.aceite))!;
      await fulfillment.cancelOrder(ids.companyA, created.orderId, { reason: 'El cliente se arrepintió', refunded: false, refundNote: '' }, actor(), false);
      expect(await available(ids.aceite)).toBe(held + 3);
      expect(await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } })).toMatchObject({ status: 'CANCELLED', cancelReason: 'El cliente se arrepintió' });
      await expect(fulfillment.cancelOrder(ids.companyA, created.orderId, { reason: 'Otra vez', refunded: false, refundNote: '' }, actor(), false)).rejects.toMatchObject({ status: 409 });
    });

    it('cancelar un pedido pagado exige permiso de administración, anula la venta y devuelve el stock', async () => {
      const created = await place({ lines: [lineAceite(2)] });
      await payments.confirmManualPayment(ids.companyA, created.orderId, actor(), null, '');
      const afterSale = await onHand(ids.aceite);
      await expect(fulfillment.cancelOrder(ids.companyA, created.orderId, { reason: 'Sin stock real', refunded: false, refundNote: '' }, actor(), false)).rejects.toMatchObject({ status: 403 });
      await fulfillment.cancelOrder(ids.companyA, created.orderId, { reason: 'Sin stock real', refunded: true, refundNote: 'Transferencia de vuelta' }, actor(), true);
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { salesDocument: true } });
      expect(order).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
      expect(order.salesDocument!.status).toBe('CANCELLED');
      expect(await onHand(ids.aceite)).toBe(afterSale + 2);
    });
  });

  // ── Seguimiento del comprador ────────────────────────────────────────────

  describe('seguimiento del comprador', () => {
    it('el enlace secreto muestra solo ese pedido y solo en su sitio', async () => {
      const created = await place({ lines: [lineAceite(1)] });
      const view = await orders.getPublicOrder(ids.siteA, created.accessToken);
      expect(view).toMatchObject({ number: created.number, status: 'OPEN', paymentStatus: 'PENDING', customerName: 'Camila Rojas' });
      expect(view!.payment).toMatchObject({ mode: 'TRANSFER' });
      expect(view!.pickup).toMatchObject({ address: 'Av. Alemania 123, Temuco' });
      expect(view!.timeline.find((step) => step.current)?.key).toBe('paid');
      // El mismo enlace desde el sitio de otra empresa no existe; uno inventado tampoco.
      expect(await orders.getPublicOrder(ids.siteB, created.accessToken)).toBeNull();
      expect(await orders.getPublicOrder(ids.siteA, 'f'.repeat(64))).toBeNull();
      expect(await orders.getPublicOrder(ids.siteA, 'corto')).toBeNull();
      // No trae datos internos.
      const text = JSON.stringify(view);
      for (const forbidden of ['companyId', 'idempotencyKey', 'providerPaymentId', 'customerEmail', 'camila@correo.cl']) expect(text).not.toContain(forbidden);
    });
  });

  // ── Aislamiento entre empresas ───────────────────────────────────────────

  describe('aislamiento entre empresas', () => {
    it('la empresa B no ve ni toca los pedidos de A', async () => {
      const created = await place({ lines: [lineAceite(1)] });
      await expect(orders.getStoreOrder(ids.companyB, created.orderId)).rejects.toBeInstanceOf(errors.StoreNotFoundError);
      expect((await orders.listStoreOrders(ids.companyB, { view: 'all', page: 1 })).rows.map((r) => r.id)).not.toContain(created.orderId);
      await expect(fulfillment.applyFulfillment(ids.companyB, created.orderId, { action: 'PREPARE', carrier: '', trackingNumber: '', trackingUrl: '' }, actor())).rejects.toBeInstanceOf(errors.StoreNotFoundError);
      await expect(payments.confirmManualPayment(ids.companyB, created.orderId, actor(), null, '')).rejects.toBeInstanceOf(errors.StoreNotFoundError);
      await expect(fulfillment.cancelOrder(ids.companyB, created.orderId, { reason: 'Intento ajeno', refunded: false, refundNote: '' }, actor(), true)).rejects.toBeInstanceOf(errors.StoreNotFoundError);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } })).status).toBe('OPEN');
    });

    it('B no puede publicar productos de A en su tienda ni editar el catálogo de A', async () => {
      await expect(catalog.getStoreProduct(ids.companyB, ids.siteB, ids.aceite)).rejects.toBeInstanceOf(errors.StoreNotFoundError);
      await expect(catalog.setProductsPublished(ids.companyB, ids.siteB, [ids.aceite], true)).rejects.toBeInstanceOf(errors.StoreNotFoundError);
      await expect(catalog.setProductsPublished(ids.companyB, ids.siteA, [ids.productoB], true)).rejects.toBeInstanceOf(errors.StoreNotFoundError);
      await expect(settingsService.getStoreSettings(ids.companyB, ids.siteA)).rejects.toBeInstanceOf(errors.StoreNotFoundError);
    });

    it('el stock de una bodega ajena no cuenta', async () => {
      const availability = await stock.getAvailability(ids.companyA, ids.warehouseB, [ids.aceite]);
      expect(availability.get(ids.aceite)?.available).toBe(0);
    });
  });

  // ── Catálogo (administración) y ajustes ──────────────────────────────────

  describe('administrar el catálogo y los ajustes', () => {
    it('publicar crea la ficha mínima con la foto del inventario y despublicar la conserva', async () => {
      const extra = await prisma.product.create({ data: { companyId: ids.companyA, sku: 'NUEVO-1', name: 'Producto Nuevo Ñandú', netPrice: 1000, grossPrice: 1190 } });
      expect(await catalog.setProductsPublished(ids.companyA, ids.siteA, [extra.id], true)).toBe(1);
      const listing = await prisma.storeProduct.findFirstOrThrow({ where: { siteId: ids.siteA, productId: extra.id } });
      expect(listing).toMatchObject({ published: true, slug: 'producto-nuevo-nandu' });
      await catalog.setProductsPublished(ids.companyA, ids.siteA, [extra.id], false);
      expect((await prisma.storeProduct.findFirstOrThrow({ where: { id: listing.id } })).published).toBe(false);
    });

    it('la dirección de un producto no se repite dentro de la tienda', async () => {
      const a = await prisma.product.create({ data: { companyId: ids.companyA, sku: 'DUP-1', name: 'Duplicado Uno', netPrice: 100, grossPrice: 119 } });
      const b = await prisma.product.create({ data: { companyId: ids.companyA, sku: 'DUP-2', name: 'Duplicado Uno', netPrice: 100, grossPrice: 119 } });
      await catalog.setProductsPublished(ids.companyA, ids.siteA, [a.id, b.id], true);
      const slugs = (await prisma.storeProduct.findMany({ where: { siteId: ids.siteA, productId: { in: [a.id, b.id] } } })).map((row) => row.slug).sort();
      expect(slugs).toEqual(['duplicado-uno', 'duplicado-uno-2']);
      await expect(catalog.saveStoreProduct(ids.companyA, ids.siteA, b.id, { title: '', summary: '', description: '', images: [], compareAtPrice: null, collection: '', featured: false, sortOrder: 0, maxPerOrder: null, slug: 'duplicado-uno' })).rejects.toMatchObject({ field: 'slug' });
    });

    it('las fotos de la ficha solo pueden venir del almacenamiento de la empresa', async () => {
      const input = { title: '', summary: '', description: '', images: [{ url: 'https://evil.example.com/x.png', alt: '' }], compareAtPrice: null, collection: '', featured: false, sortOrder: 0, maxPerOrder: null };
      await expect(catalog.saveStoreProduct(ids.companyA, ids.siteA, ids.aceite, input)).rejects.toMatchObject({ field: 'images' });
    });

    it('el precio tachado debe ser mayor que el actual', async () => {
      const input = { title: '', summary: '', description: '', images: [], compareAtPrice: 5000, collection: '', featured: false, sortOrder: 0, maxPerOrder: null };
      await expect(catalog.saveStoreProduct(ids.companyA, ids.siteA, ids.aceite, input)).rejects.toMatchObject({ field: 'compareAtPrice' });
    });

    it('la bandeja filtra por vista y cuenta cada una', async () => {
      const page = await orders.listStoreOrders(ids.companyA, { view: 'all', page: 1 });
      expect(page.total).toBeGreaterThan(5);
      expect(page.counts.all).toBe(page.total);
      const toConfirm = await orders.listStoreOrders(ids.companyA, { view: 'to-confirm', page: 1 });
      expect(toConfirm.rows.every((row) => row.paymentStatus === 'PENDING' && row.status === 'OPEN')).toBe(true);
      expect(toConfirm.counts['to-confirm']).toBe(toConfirm.total);
      const stats = await orders.getStoreStats(ids.companyA);
      expect(stats.paidToday).toBeGreaterThan(0);
      expect(stats.salesToday).toBeGreaterThan(0);
    });

    it('buscar por número, nombre o correo', async () => {
      const created = await place({ customer: { name: 'Zacarías Quispe', email: 'zacarias@raro.cl', phone: '+56 9 8888 7777', rut: '' } });
      expect((await orders.listStoreOrders(ids.companyA, { view: 'all', q: String(created.number), page: 1 })).rows.map((r) => r.id)).toContain(created.orderId);
      expect((await orders.listStoreOrders(ids.companyA, { view: 'all', q: 'zacar', page: 1 })).rows).toHaveLength(1);
      expect((await orders.listStoreOrders(ids.companyA, { view: 'all', q: 'raro.cl', page: 1 })).rows).toHaveLength(1);
      expect((await orders.listStoreOrders(ids.companyB, { view: 'all', q: 'zacar', page: 1 })).rows).toHaveLength(0);
    });
  });

  describe('abrir y cerrar la tienda', () => {
    it('abrir exige lo obligatorio; cerrar siempre se puede; guardar ajustes incompletos cierra la tienda sola', async () => {
      const siteC = await prisma.webSite.create({ data: { companyId: ids.companyA, name: 'Sitio C', slug: `sitio-c-${suffix}`, status: 'DRAFT', draftBlocks: [] } });
      await settingsService.ensureStore(ids.companyA, siteC.id);
      await expect(settingsService.setStoreOpen(ids.companyA, siteC.id, true)).rejects.toThrow(/Aún no se puede abrir la tienda/);
      await expect(settingsService.setStoreOpen(ids.companyA, siteC.id, false)).resolves.toBeDefined();

      // La tienda A está completa: se puede cerrar y volver a abrir.
      await settingsService.setStoreOpen(ids.companyA, ids.siteA, false);
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).enabled).toBe(false);
      const report = await settingsService.setStoreOpen(ids.companyA, ids.siteA, true);
      expect(report.canOpen).toBe(true);
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).enabled).toBe(true);
    });

    it('la llave de Webpay se guarda cifrada, no vuelve al navegador y vacío conserva la guardada', async () => {
      const settings = await settingsService.getStoreSettings(ids.companyA, ids.siteA);
      expect(settings.webpayHasSecret).toBe(true);
      expect(JSON.stringify(settings)).not.toContain('secreto-webpay');
      const input = {
        warehouseId: settings.warehouseId, notifyEmail: '', supportPhone: '', pickupEnabled: true, pickupAddress: 'Av. Alemania 123, Temuco', pickupInstructions: '', shippingEnabled: true, shippingRates: settings.shippingRates,
        paymentMethods: settings.paymentMethods, bankTransferInfo: settings.bankTransferInfo, transferHoldHours: 48, webpayCommerceCode: settings.webpayCommerceCode, webpayApiSecret: '', clearWebpaySecret: false,
        webpayProduction: false, invoiceEnabled: true, termsText: '', returnsText: '', minOrderAmount: 0,
      };
      const before = (await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).webpayApiSecret;
      await settingsService.updateStoreSettings(ids.companyA, ids.siteA, input as never);
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).webpayApiSecret).toBe(before);
      await settingsService.updateStoreSettings(ids.companyA, ids.siteA, { ...input, webpayApiSecret: 'otra-llave' } as never);
      const after = (await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).webpayApiSecret!;
      expect(after).not.toBe(before);
      expect(after).not.toContain('otra-llave');
      // Restaurar para los demás tests.
      await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { webpayApiSecret: before } });
    });

    it('guardar ajustes que dejan la tienda sin forma de cobrar la cierran', async () => {
      const settings = await settingsService.getStoreSettings(ids.companyA, ids.siteA);
      const input = {
        warehouseId: settings.warehouseId, notifyEmail: '', supportPhone: '', pickupEnabled: true, pickupAddress: 'Av. Alemania 123, Temuco', pickupInstructions: '', shippingEnabled: true, shippingRates: settings.shippingRates,
        paymentMethods: [], bankTransferInfo: settings.bankTransferInfo, transferHoldHours: 48, webpayCommerceCode: settings.webpayCommerceCode, webpayApiSecret: '', clearWebpaySecret: false,
        webpayProduction: false, invoiceEnabled: true, termsText: '', returnsText: '', minOrderAmount: 0,
      };
      try {
        const saved = await settingsService.updateStoreSettings(ids.companyA, ids.siteA, input as never);
        expect(saved.enabled).toBe(false);
        expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).enabled).toBe(false);
      } finally {
        await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteA }, data: { enabled: true, paymentMethods: ['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP'] } });
      }
    });
  });
});

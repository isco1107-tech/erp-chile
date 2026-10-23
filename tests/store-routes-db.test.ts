/**
 * Rutas públicas de la tienda (`/api/public/store/**`) y su cron, contra PostgreSQL REAL (mismas
 * reglas que `tests/store-db.test.ts`: solo corre contra una base local cuyo nombre termina en `_test`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/erp_store_test \
 *     npx jest tests/store-routes-db.test.ts
 *
 * Lo que protege: que la empresa salga del sitio y nunca del cuerpo, que el navegador no pueda fijar
 * precios, que el señuelo y los límites frenen bots sin crear pedidos, que Khipu y Webpay se
 * consulten de verdad antes de dar un pedido por pagado, que el puente de Webpay solo sirva un cobro
 * pendiente hacia Transbank y que el cron solo lo abra quien tiene el secreto.
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

describeDb('rutas públicas de la tienda contra PostgreSQL', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let quoteRoute: typeof import('@/app/api/public/store/[slug]/quote/route');
  let checkoutRoute: typeof import('@/app/api/public/store/[slug]/checkout/route');
  let payRoute: typeof import('@/app/api/public/store/order/[token]/pay/route');
  let khipuRoute: typeof import('@/app/api/public/store/khipu/notify/route');
  let webpayStart: typeof import('@/app/api/public/store/webpay/start/route');
  let webpayReturn: typeof import('@/app/api/public/store/webpay/return/route');
  let cronRoute: typeof import('@/app/api/store/expire/cron/route');
  let sitemapRoute: typeof import('@/app/web/[slug]/sitemap.xml/route');
  let encrypt: (value: string) => string;

  const suffix = Math.random().toString(36).slice(2, 8);
  const slugA = `ruta-a-${suffix}`;
  const slugB = `ruta-b-${suffix}`;
  const ids = { companyA: '', companyB: '', warehouseA: '', warehouseB: '', siteA: '', siteB: '', aceite: '', escaso: '', productoB: '' };
  let tokenCounter = 0;
  /** Transbank entrega un token distinto por transacción: 64 hexadecimales. */
  const newWebpayToken = () => `${(++tokenCounter).toString(16).padStart(8, '0')}${'a1b2c3d4'.repeat(7)}`;

  let ipCounter = 0;
  /** Cada solicitud llega de una IP distinta para que el límite por IP de una prueba no afecte a otra. */
  const nextIp = () => `10.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}.7`;
  let sequence = 0;
  const key = () => `ck_${suffix}${String(++sequence).padStart(12, '0')}`;

  function post(url: string, body: unknown, ip = nextIp()): Request {
    return new Request(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  }
  const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
  const json = async (response: Response) => (await response.json()) as { success: boolean; error?: string; field?: string; code?: string; data?: Record<string, unknown> };

  /** Cada compra de prueba es de una persona distinta: el tope de pedidos sin pagar es por correo. */
  let buyers = 0;
  const checkoutBody = (over: Record<string, unknown> = {}) => ({
    idempotencyKey: key(),
    lines: [{ productId: ids.aceite, quantity: 1 }],
    customer: { name: 'Camila Rojas', email: `comprador${++buyers}.${suffix}@correo.cl`, phone: '+56 9 1234 5678' },
    documentType: 'BOLETA',
    deliveryMethod: 'PICKUP',
    paymentProvider: 'TRANSFER',
    acceptTerms: true,
    website: '',
    ...over,
  });
  const placeOrder = async (over: Record<string, unknown> = {}) => {
    const response = await checkoutRoute.POST(post(`/api/public/store/${slugA}/checkout`, checkoutBody(over)), params({ slug: slugA }));
    return { response, body: await json(response) };
  };
  const orderOf = async (token: unknown) => prisma.storeOrder.findUniqueOrThrow({ where: { accessToken: String(token) } });

  function mockGateways(handlers: { khipu?: (url: string, init: RequestInit) => unknown; webpay?: (url: string, init: RequestInit) => unknown }) {
    const calls: Array<{ url: string; method: string }> = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, method: init.method ?? 'GET' });
      const handler = url.includes('khipu') ? handlers.khipu : url.includes('transbank') ? handlers.webpay : undefined;
      if (!handler) throw new Error(`fetch no previsto: ${url}`);
      return new Response(JSON.stringify(handler(url, init)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch);
    return calls;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.PAYMENTS_ENCRYPTION_KEY = 'clave-de-prueba-de-la-tienda';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    ({ encryptPaymentCredential: encrypt } = await import('@/lib/payments/crypto'));
    quoteRoute = await import('@/app/api/public/store/[slug]/quote/route');
    checkoutRoute = await import('@/app/api/public/store/[slug]/checkout/route');
    payRoute = await import('@/app/api/public/store/order/[token]/pay/route');
    khipuRoute = await import('@/app/api/public/store/khipu/notify/route');
    webpayStart = await import('@/app/api/public/store/webpay/start/route');
    webpayReturn = await import('@/app/api/public/store/webpay/return/route');
    cronRoute = await import('@/app/api/store/expire/cron/route');
    sitemapRoute = await import('@/app/web/[slug]/sitemap.xml/route');

    const features = { hasWebSites: true, hasEcommerce: true, hasInventory: true };
    const company = (n: number, name: string) =>
      prisma.company.create({ data: { rut: `77${suffix}${n}-${n}`, businessName: name, status: 'ACTIVE', features: { create: features }, settings: { create: { khipuApiCredential: encrypt('llave-khipu') } } } });
    ids.companyA = (await company(1, `Ruta A ${suffix}`)).id;
    ids.companyB = (await company(2, `Ruta B ${suffix}`)).id;
    ids.warehouseA = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Central', code: 'CEN', isDefault: true } })).id;
    ids.warehouseB = (await prisma.warehouse.create({ data: { companyId: ids.companyB, name: 'Bodega B', code: 'B', isDefault: true } })).id;
    const site = (companyId: string, name: string, slug: string) =>
      prisma.webSite.create({ data: { companyId, name, slug, status: 'PUBLISHED', publishedAt: new Date(), publishedBlocks: [], draftBlocks: [] } });
    ids.siteA = (await site(ids.companyA, 'Tienda A', slugA)).id;
    ids.siteB = (await site(ids.companyB, 'Tienda B', slugB)).id;
    await prisma.webSiteStore.create({
      data: {
        companyId: ids.companyA,
        siteId: ids.siteA,
        enabled: true,
        warehouseId: ids.warehouseA,
        pickupEnabled: true,
        pickupAddress: 'Av. Alemania 123, Temuco',
        shippingEnabled: true,
        shippingRates: [{ id: 'pais', name: 'Despacho a todo Chile', regions: [], price: 5990, freeOver: null, minDays: 3, maxDays: 5, note: '' }],
        paymentMethods: ['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP'],
        bankTransferInfo: 'Banco Estado\nCuenta vista 123456',
        webpayCommerceCode: '597055555532',
        webpayApiSecret: encrypt('secreto-webpay'),
        webpayProduction: false,
        invoiceEnabled: true,
      },
    });
    await prisma.webSiteStore.create({ data: { companyId: ids.companyB, siteId: ids.siteB, enabled: true, warehouseId: ids.warehouseB, pickupEnabled: true, pickupAddress: 'Calle B 1', paymentMethods: ['TRANSFER'], bankTransferInfo: 'Banco B' } });
    const product = (companyId: string, sku: string, name: string, extra: Record<string, unknown> = {}) => prisma.product.create({ data: { companyId, sku, name, netPrice: 8395, grossPrice: 9990, costPricePMP: 4000, ...extra } });
    ids.aceite = (await product(ids.companyA, 'ACE-900', 'Aceite Maravilla 900 ml')).id;
    ids.escaso = (await product(ids.companyA, 'ESC-1', 'Producto escaso', { netPrice: 1681, grossPrice: 2000 })).id;
    ids.productoB = (await product(ids.companyB, 'ACE-900', 'Aceite de la empresa B')).id;
    await prisma.stock.createMany({
      data: [
        { companyId: ids.companyA, productId: ids.aceite, warehouseId: ids.warehouseA, quantity: 500 },
        { companyId: ids.companyA, productId: ids.escaso, warehouseId: ids.warehouseA, quantity: 2 },
        { companyId: ids.companyB, productId: ids.productoB, warehouseId: ids.warehouseB, quantity: 9 },
      ],
    });
    await prisma.storeProduct.createMany({
      data: [
        { companyId: ids.companyA, siteId: ids.siteA, productId: ids.aceite, slug: 'aceite-maravilla', published: true, collection: 'Despensa' },
        { companyId: ids.companyA, siteId: ids.siteA, productId: ids.escaso, slug: 'producto-escaso', published: true },
        { companyId: ids.companyB, siteId: ids.siteB, productId: ids.productoB, slug: 'aceite-b', published: true },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.CRON_SECRET;
  });

  afterAll(async () => {
    if (!prisma) return;
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
        await prisma.folioSequence.deleteMany({ where: { companyId } });
        await prisma.warehouse.deleteMany({ where: { companyId } });
        await prisma.workflowNotification.deleteMany({ where: { companyId } });
        await prisma.company.delete({ where: { id: companyId } });
      } catch {
        /* la base de pruebas es descartable */
      }
    }
    await prisma.$disconnect();
  });

  describe('cotizar el carrito', () => {
    it('valoriza con los datos de la base: el navegador no puede fijar un precio', async () => {
      const response = await quoteRoute.POST(
        post(`/api/public/store/${slugA}/quote`, { lines: [{ productId: ids.aceite, quantity: 2, price: 1, grossUnit: 1, netUnit: 1 }], companyId: ids.companyB }),
        params({ slug: slugA })
      );
      const body = await json(response);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const quote = body.data as { lines: Array<{ grossUnit: number; quantity: number }>; subtotal: number; shippingEnabled: boolean; shippingRegions: string[] | null; paymentProviders: Array<{ id: string }> };
      expect(quote.lines[0]).toMatchObject({ grossUnit: 9990, quantity: 2 });
      expect(quote.subtotal).toBe(19980);
      expect(quote.shippingEnabled).toBe(true);
      expect(quote.shippingRegions).toBeNull(); // una tarifa llega a todo Chile
      expect(quote.paymentProviders.map((p) => p.id)).toEqual(['KHIPU', 'WEBPAY', 'TRANSFER', 'PAY_ON_PICKUP']);
      expect(JSON.stringify(body)).not.toContain('secreto-webpay');
      expect(JSON.stringify(body)).not.toContain('Cuenta vista 123456');
    });

    it('ajusta lo que no alcanza, avisa el problema y no deja ver productos de otra tienda', async () => {
      const response = await quoteRoute.POST(
        post(`/api/public/store/${slugA}/quote`, { lines: [{ productId: ids.escaso, quantity: 5 }, { productId: ids.productoB, quantity: 1 }], region: 'Región de Tarapacá', deliveryMethod: 'SHIPPING', shippingRateId: 'pais' }),
        params({ slug: slugA })
      );
      const quote = (await json(response)).data as { lines: Array<{ productId: string; quantity: number; problem: string | null }>; removedProductIds: string[]; pricing: { shippingTotal: number } | null };
      expect(quote.lines).toHaveLength(1);
      expect(quote.lines[0]).toMatchObject({ productId: ids.escaso, quantity: 2, problem: 'REDUCED' });
      expect(quote.removedProductIds).toEqual([ids.productoB]);
      expect(quote.pricing?.shippingTotal).toBe(5990);
    });

    it('responde 404 sin revelar nada si la tienda no existe o está cerrada', async () => {
      const missing = await quoteRoute.POST(post('/api/public/store/no-existe-xyz/quote', { lines: [] }), params({ slug: 'no-existe-xyz' }));
      expect(missing.status).toBe(404);
      await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteB }, data: { enabled: false } });
      try {
        const closed = await quoteRoute.POST(post(`/api/public/store/${slugB}/quote`, { lines: [] }), params({ slug: slugB }));
        expect(closed.status).toBe(404);
      } finally {
        await prisma.webSiteStore.updateMany({ where: { siteId: ids.siteB }, data: { enabled: true } });
      }
    });

    it('rechaza cuerpos inválidos o gigantes sin tocar la base', async () => {
      expect((await quoteRoute.POST(post(`/api/public/store/${slugA}/quote`, '{no es json'), params({ slug: slugA }))).status).toBe(400);
      expect((await quoteRoute.POST(post(`/api/public/store/${slugA}/quote`, { lines: [{ productId: ids.aceite, quantity: 0 }] }), params({ slug: slugA }))).status).toBe(400);
      expect((await quoteRoute.POST(post(`/api/public/store/${slugA}/quote`, { lines: [], pad: 'x'.repeat(20_000) }), params({ slug: slugA }))).status).toBe(413);
    });

    it('frena la ráfaga desde una misma IP con 429 y Retry-After', async () => {
      const ip = '203.0.113.99';
      let last: Response | null = null;
      for (let i = 0; i < 125; i += 1) last = await quoteRoute.POST(post(`/api/public/store/${slugA}/quote`, { lines: [] }, ip), params({ slug: slugA }));
      expect(last!.status).toBe(429);
      expect(Number(last!.headers.get('Retry-After'))).toBeGreaterThan(0);
    });
  });

  describe('crear el pedido', () => {
    it('una transferencia crea el pedido con el precio de la base, aparta stock y no lleva a ninguna pasarela', async () => {
      const { response, body } = await placeOrder({ lines: [{ productId: ids.aceite, quantity: 2 }], paymentProvider: 'TRANSFER' });
      expect(response.status).toBe(200);
      expect(body.data).toMatchObject({ paymentProvider: 'TRANSFER', redirectUrl: null, replayed: false });
      expect(body.data!.orderToken).toMatch(/^[a-f0-9]{64}$/);
      const order = await orderOf(body.data!.orderToken);
      expect(order).toMatchObject({ companyId: ids.companyA, siteId: ids.siteA, total: 19980, paymentStatus: 'PENDING', status: 'OPEN' });
      expect(await prisma.storeStockReservation.count({ where: { orderId: order.id } })).toBe(1);
    });

    it('un reintento con la misma clave devuelve el mismo pedido y no lo duplica', async () => {
      const body = checkoutBody();
      const first = await json(await checkoutRoute.POST(post(`/api/public/store/${slugA}/checkout`, body), params({ slug: slugA })));
      const second = await json(await checkoutRoute.POST(post(`/api/public/store/${slugA}/checkout`, body), params({ slug: slugA })));
      expect(second.data).toMatchObject({ orderToken: first.data!.orderToken, replayed: true });
      expect(await prisma.storeOrder.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(1);
    });

    it('el señuelo responde sin crear ningún pedido', async () => {
      const body = checkoutBody({ website: 'http://spam.example' });
      const response = await checkoutRoute.POST(post(`/api/public/store/${slugA}/checkout`, body), params({ slug: slugA }));
      expect(response.status).toBe(400);
      expect(await prisma.storeOrder.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(0);
    });

    it('un dato inválido responde 400 con el mensaje y el campo', async () => {
      const { response, body } = await placeOrder({ customer: { name: 'Camila Rojas', email: 'no-es-correo', phone: '+56 9 1234 5678' } });
      expect(response.status).toBe(400);
      expect(body.error).toBeTruthy();
      expect(body.field).toBe('email');
    });

    it('sin stock suficiente responde 409 con el detalle y no deja nada apartado', async () => {
      const key1 = key();
      const { response, body } = await placeOrder({ idempotencyKey: key1, lines: [{ productId: ids.escaso, quantity: 50 }] });
      expect(response.status).toBe(409);
      expect(body.code).toBe('OUT_OF_STOCK');
      expect((body as unknown as { shortages: Array<{ available: number }> }).shortages[0]!.available).toBeLessThanOrEqual(2);
      expect(await prisma.storeOrder.count({ where: { idempotencyKey: key1 } })).toBe(0);
    });

    it('un producto de otra empresa no se puede comprar por esta tienda', async () => {
      const key1 = key();
      const { response } = await placeOrder({ idempotencyKey: key1, lines: [{ productId: ids.productoB, quantity: 1 }] });
      expect(response.status).toBe(409);
      expect(await prisma.storeOrder.count({ where: { idempotencyKey: key1 } })).toBe(0);
    });

    it('Khipu: abre el cobro con la llave de la empresa y devuelve la dirección de pago', async () => {
      const calls = mockGateways({ khipu: () => ({ payment_id: 'kp-ruta-1', payment_url: 'https://khipu.com/payment/kp-ruta-1' }) });
      const { response, body } = await placeOrder({ paymentProvider: 'KHIPU' });
      expect(response.status).toBe(200);
      expect(body.data!.redirectUrl).toBe('https://khipu.com/payment/kp-ruta-1');
      expect(calls).toHaveLength(1);
      expect((await orderOf(body.data!.orderToken)).providerPaymentId).toBe('kp-ruta-1');
    });

    it('si la pasarela falla, el pedido se cancela y el stock vuelve', async () => {
      jest.spyOn(globalThis, 'fetch').mockImplementation((async () => new Response('boom', { status: 500 })) as typeof fetch);
      const key1 = key();
      const { response } = await placeOrder({ idempotencyKey: key1, paymentProvider: 'KHIPU' });
      expect(response.status).toBeGreaterThanOrEqual(400);
      const order = await prisma.storeOrder.findFirst({ where: { idempotencyKey: key1 } });
      expect(order?.status).toBe('CANCELLED');
      expect(await prisma.storeStockReservation.count({ where: { orderId: order!.id, status: 'ACTIVE' } })).toBe(0);
    });
  });

  describe('Khipu', () => {
    async function khipuOrder(paymentId: string) {
      mockGateways({ khipu: () => ({ payment_id: paymentId, payment_url: `https://khipu.com/payment/${paymentId}` }) });
      const { body } = await placeOrder({ paymentProvider: 'KHIPU' });
      jest.restoreAllMocks();
      return orderOf(body.data!.orderToken);
    }

    it('la notificación solo ubica el pedido: el pago se da por bueno consultando a Khipu con monto exacto', async () => {
      const order = await khipuOrder('kp-notify-1');
      // Aviso falso: Khipu dice que no está pagado → no se marca nada.
      mockGateways({ khipu: () => ({ payment_id: 'kp-notify-1', status: 'pending', amount: order.total, currency: 'CLP', transaction_id: order.id }) });
      const fake = await khipuRoute.POST(post('/api/public/store/khipu/notify', { payment_id: 'kp-notify-1', status: 'done' }));
      expect(fake.status).toBe(200);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PENDING');

      // Cobro real: Khipu confirma el monto y la referencia → pagado.
      jest.restoreAllMocks();
      mockGateways({ khipu: () => ({ payment_id: 'kp-notify-1', status: 'done', amount: order.total, currency: 'CLP', transaction_id: order.id }) });
      const real = await khipuRoute.POST(post('/api/public/store/khipu/notify', 'payment_id=kp-notify-1'));
      expect(real.status).toBe(200);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PAID');
    });

    it('un cobro que no es de este sistema responde 200 sin consultar nada; sin payment_id, 400', async () => {
      const spy = jest.spyOn(globalThis, 'fetch');
      expect((await khipuRoute.POST(post('/api/public/store/khipu/notify', { payment_id: 'no-es-nuestro' }))).status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
      expect((await khipuRoute.POST(post('/api/public/store/khipu/notify', {}))).status).toBe(400);
      expect((await khipuRoute.POST(post('/api/public/store/khipu/notify', { payment_id: 'x'.repeat(200) }))).status).toBe(400);
    });

    it('«Pagar ahora» reutiliza el cobro vigente y no acepta enlaces que no existen', async () => {
      const order = await khipuOrder('kp-pay-1');
      const reuse = await payRoute.POST(post(`/api/public/store/order/${order.accessToken}/pay`, {}), params({ token: order.accessToken }));
      expect(reuse.status).toBe(200);
      expect((await json(reuse)).data).toEqual({ redirectUrl: 'https://khipu.com/payment/kp-pay-1' });
      const unknown = await payRoute.POST(post(`/api/public/store/order/${'0'.repeat(64)}/pay`, {}), params({ token: '0'.repeat(64) }));
      expect(unknown.status).toBe(404);
      const malformed = await payRoute.POST(post('/api/public/store/order/corto/pay', {}), params({ token: 'corto' }));
      expect(malformed.status).toBe(404);
    });

    it('un pedido de transferencia no se «paga ahora» por internet', async () => {
      const { body } = await placeOrder({ paymentProvider: 'TRANSFER' });
      const response = await payRoute.POST(post('/api/public/store/order/x/pay', {}), params({ token: String(body.data!.orderToken) }));
      expect(response.status).toBe(409);
    });
  });

  describe('Webpay', () => {
    const TBK_URL = 'https://webpay3gint.transbank.cl/webpayserver/initTransaction';
    async function webpayOrder() {
      const token = newWebpayToken();
      mockGateways({ webpay: () => ({ token, url: TBK_URL }) });
      const { body } = await placeOrder({ paymentProvider: 'WEBPAY' });
      jest.restoreAllMocks();
      return { order: await orderOf(body.data!.orderToken), redirectUrl: String(body.data!.redirectUrl), token };
    }

    it('el puente es un formulario POST con el token hacia Transbank, sin guardar en caché', async () => {
      const { order, redirectUrl, token } = await webpayOrder();
      expect(redirectUrl).toContain(`/api/public/store/webpay/start?o=${order.accessToken}`);
      const response = await webpayStart.GET(new Request(redirectUrl, { headers: { 'x-forwarded-for': nextIp() } }));
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Type')).toMatch(/^text\/html/);
      expect(html).toContain(`action="${TBK_URL}"`);
      expect(html).toContain(`name="token_ws" value="${token}"`);
    });

    it('el puente no sirve un enlace inexistente, un pedido de otro medio ni un cobro ya pagado', async () => {
      const get = (token: string) => webpayStart.GET(new Request(`http://localhost/api/public/store/webpay/start?o=${token}`, { headers: { 'x-forwarded-for': nextIp() } }));
      expect((await get('0'.repeat(64))).status).toBe(404);
      expect((await get('corto')).status).toBe(404);
      expect((await get('')).status).toBe(404);
      const { body } = await placeOrder({ paymentProvider: 'TRANSFER' });
      expect((await get(String(body.data!.orderToken))).status).toBe(404);
      const { order } = await webpayOrder();
      await prisma.storeOrder.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } });
      expect((await get(order.accessToken)).status).toBe(404);
    });

    it('el puente jamás manda al comprador a un destino que no sea de Transbank', async () => {
      const { order } = await webpayOrder();
      await prisma.storeOrder.update({ where: { id: order.id }, data: { paymentUrl: 'https://evil.example/pay' } });
      const response = await webpayStart.GET(new Request(`http://localhost/api/public/store/webpay/start?o=${order.accessToken}`, { headers: { 'x-forwarded-for': nextIp() } }));
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('evil.example');
    });

    it('al volver con token_ws se confirma con Transbank y se redirige (303) al pedido', async () => {
      const { order, token } = await webpayOrder();
      const calls = mockGateways({ webpay: () => ({ status: 'AUTHORIZED', response_code: 0, amount: order.total, buy_order: order.id, authorization_code: '1213', payment_type_code: 'VD' }) });
      const form = new URLSearchParams({ token_ws: token });
      const response = await webpayReturn.POST(new Request('http://localhost/api/public/store/webpay/return', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form }));
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toContain(`/pedido/${order.accessToken}`);
      expect(calls.some((call) => call.method === 'PUT' && call.url.includes(`/transactions/${token}`))).toBe(true);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PAID');
    });

    it('un retorno con monto distinto no paga: Transbank se consulta y el monto debe coincidir', async () => {
      const { order, token } = await webpayOrder();
      mockGateways({ webpay: () => ({ status: 'AUTHORIZED', response_code: 0, amount: order.total - 100, buy_order: order.id }) });
      const response = await webpayReturn.GET(new Request(`http://localhost/api/public/store/webpay/return?token_ws=${token}`));
      expect(response.status).toBe(303);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).not.toBe('PAID');
    });

    it('si el comprador anula en Transbank (TBK_TOKEN) el pedido sigue abierto y puede reintentar', async () => {
      const { order, token } = await webpayOrder();
      const spy = jest.spyOn(globalThis, 'fetch');
      const response = await webpayReturn.GET(new Request(`http://localhost/api/public/store/webpay/return?TBK_TOKEN=${token}&TBK_ORDEN_COMPRA=${order.id}`));
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toContain(`/pedido/${order.accessToken}`);
      expect(spy).not.toHaveBeenCalled();
      const after = await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after).toMatchObject({ status: 'OPEN', paymentStatus: 'FAILED' });
    });

    it('un token que no es de este sistema vuelve a la plataforma sin revelar nada', async () => {
      const response = await webpayReturn.GET(new Request('http://localhost/api/public/store/webpay/return?token_ws=desconocido'));
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).not.toContain('/pedido/');
    });
  });

  describe('cron y mapa del sitio', () => {
    it('el cron exige el secreto y, con él, vence los pedidos sin pagar', async () => {
      const { body } = await placeOrder({ paymentProvider: 'TRANSFER' });
      const order = await orderOf(body.data!.orderToken);
      await prisma.storeOrder.update({ where: { id: order.id }, data: { paymentExpiresAt: new Date(Date.now() - 3 * 3600_000) } });

      expect((await cronRoute.GET(new Request('http://localhost/api/store/expire/cron'))).status).toBe(401);
      process.env.CRON_SECRET = 'secreto-del-cron';
      expect((await cronRoute.GET(new Request('http://localhost/api/store/expire/cron', { headers: { authorization: 'Bearer otro' } }))).status).toBe(401);
      const ok = await cronRoute.GET(new Request('http://localhost/api/store/expire/cron', { headers: { authorization: 'Bearer secreto-del-cron' } }));
      expect(ok.status).toBe(200);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('EXPIRED');
    });

    it('el cron cerrado: sin CRON_SECRET en el entorno nadie entra', async () => {
      delete process.env.CRON_SECRET;
      expect((await cronRoute.GET(new Request('http://localhost/api/store/expire/cron', { headers: { authorization: 'Bearer undefined' } }))).status).toBe(401);
    });

    it('el mapa del sitio suma el catálogo y las fichas publicadas', async () => {
      await prisma.webSite.update({ where: { id: ids.siteA }, data: { indexable: true } });
      const response = await sitemapRoute.GET(new Request(`http://localhost/web/${slugA}/sitemap.xml`), { params: Promise.resolve({ slug: slugA }) });
      const xml = await response.text();
      expect(response.status).toBe(200);
      expect(xml).toContain(`/web/${slugA}/tienda<`);
      expect(xml).toContain(`/web/${slugA}/producto/aceite-maravilla<`);
      expect(xml).not.toContain('aceite-b');
    });
  });
});

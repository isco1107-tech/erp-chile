/**
 * Panel de la tienda (acciones del servidor y exportación a Excel) contra PostgreSQL REAL
 * (mismas reglas que `tests/store-db.test.ts`: solo corre contra una base local cuyo nombre termina en `_test`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/erp_store_test \
 *     npx jest tests/store-actions-db.test.ts
 *
 * Lo que protege: que cada acción exija SU permiso (`store:read|write|fulfill|manage`) y los dos módulos,
 * que una empresa no pueda leer ni tocar pedidos, productos ni ajustes de otra, que confirmar un pago
 * emita la venta, que cancelar un pedido pagado exija administración, que la llave de Webpay no vuelva
 * al navegador ni a la bitácora, que abrir la tienda exija «qué le falta» y que el Excel respete el
 * permiso, los filtros, la auditoría y no ejecute fórmulas escritas por un comprador.
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

const ALL = ['store:read', 'store:write', 'store:fulfill', 'store:manage'] as const;
type Session = { id: string; email: string; name: string; companyId: string; permissions: string[] };
let currentSession: Session | null = null;
const auditCalls: Array<Record<string, unknown>> = [];

jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn(async (input: Record<string, unknown>) => void auditCalls.push(input)) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/guards', () => {
  const actual = jest.requireActual('@/lib/auth/guards');
  return {
    ...actual,
    requireAuthWithPermission: jest.fn(async (permission: string) => {
      if (!currentSession) throw new actual.AuthError('No autenticado', 401);
      if (!currentSession.permissions.includes(permission)) throw new actual.AuthError('No autorizado para esta acción', 403);
      return currentSession;
    }),
  };
});

describeDb('panel de la tienda contra PostgreSQL', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let actions: typeof import('@/modules/ecommerce/actions/store.actions');
  let exportRoute: typeof import('@/app/api/store/orders/export/route');
  let checkout: typeof import('@/modules/ecommerce/services/store-checkout.service');
  let publicStore: typeof import('@/modules/ecommerce/services/store-public.service');
  let webSites: typeof import('@/modules/web-sites/services/web-sites.service');
  let ExcelJS: typeof import('exceljs');
  let encrypt: (value: string) => string;

  const suffix = Math.random().toString(36).slice(2, 8);
  const slugA = `panel-a-${suffix}`;
  const ids = { companyA: '', companyB: '', warehouseA: '', warehouseB: '', siteA: '', siteB: '', userA: '', userB: '', aceite: '', productoB: '' };
  let sequence = 0;
  const key = () => `ck_${suffix}${String(++sequence).padStart(12, '0')}`;

  const sessionOf = (companyId: string, userId: string, permissions: readonly string[] = ALL): Session => ({ id: userId, email: `u-${userId}@test.cl`, name: 'Ana Operaria', companyId, permissions: [...permissions] });
  const asA = (permissions: readonly string[] = ALL) => void (currentSession = sessionOf(ids.companyA, ids.userA, permissions));
  const asB = (permissions: readonly string[] = ALL) => void (currentSession = sessionOf(ids.companyB, ids.userB, permissions));

  /** Cada compra de prueba es de una persona distinta: el tope de pedidos sin pagar es por correo. */
  let buyers = 0;
  async function place(over: Record<string, unknown> = {}) {
    const ctx = await publicStore.resolvePublicStore(slugA);
    if (!ctx) throw new Error('La tienda de prueba no se resolvió');
    return checkout.createStoreOrder(
      ctx,
      {
        idempotencyKey: key(),
        lines: [{ productId: ids.aceite, quantity: 1 }],
        customer: { name: 'Camila Rojas', email: `comprador${++buyers}.${suffix}@correo.cl`, phone: '+56 9 1234 5678', rut: '' },
        documentType: 'BOLETA',
        deliveryMethod: 'PICKUP',
        paymentProvider: 'TRANSFER',
        acceptTerms: true,
        ...over,
      } as never
    );
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.PAYMENTS_ENCRYPTION_KEY = 'clave-de-prueba-de-la-tienda';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    ({ encryptPaymentCredential: encrypt } = await import('@/lib/payments/crypto'));
    actions = await import('@/modules/ecommerce/actions/store.actions');
    exportRoute = await import('@/app/api/store/orders/export/route');
    checkout = await import('@/modules/ecommerce/services/store-checkout.service');
    publicStore = await import('@/modules/ecommerce/services/store-public.service');
    webSites = await import('@/modules/web-sites/services/web-sites.service');
    ExcelJS = (await import('exceljs')).default as unknown as typeof import('exceljs');

    const features = { hasWebSites: true, hasEcommerce: true, hasInventory: true };
    const company = (n: number, name: string) =>
      prisma.company.create({ data: { rut: `78${suffix}${n}-${n}`, businessName: name, status: 'ACTIVE', features: { create: features }, settings: { create: { khipuApiCredential: encrypt('llave-khipu') } } } });
    ids.companyA = (await company(1, `Panel A ${suffix}`)).id;
    ids.companyB = (await company(2, `Panel B ${suffix}`)).id;
    ids.warehouseA = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Central', code: 'CEN', isDefault: true } })).id;
    ids.warehouseB = (await prisma.warehouse.create({ data: { companyId: ids.companyB, name: 'Bodega B', code: 'B', isDefault: true } })).id;
    ids.userA = (await prisma.user.create({ data: { email: `ana-${suffix}@test.cl`, passwordHash: 'x', name: 'Ana Operaria', companyId: ids.companyA, role: 'ADMIN' } })).id;
    ids.userB = (await prisma.user.create({ data: { email: `beto-${suffix}@test.cl`, passwordHash: 'x', name: 'Beto Operario', companyId: ids.companyB, role: 'ADMIN' } })).id;
    const site = (companyId: string, name: string, slug: string) => prisma.webSite.create({ data: { companyId, name, slug, status: 'PUBLISHED', publishedAt: new Date(), publishedBlocks: [], draftBlocks: [] } });
    ids.siteA = (await site(ids.companyA, 'Tienda A', slugA)).id;
    ids.siteB = (await site(ids.companyB, 'Tienda B', `panel-b-${suffix}`)).id;
    await prisma.webSiteStore.create({
      data: {
        companyId: ids.companyA, siteId: ids.siteA, enabled: true, warehouseId: ids.warehouseA, pickupEnabled: true, pickupAddress: 'Av. Alemania 123, Temuco',
        paymentMethods: ['TRANSFER', 'PAY_ON_PICKUP'], bankTransferInfo: 'Banco Estado\nCuenta 123', webpayCommerceCode: '597055555532', webpayApiSecret: encrypt('secreto-webpay'),
      },
    });
    await prisma.webSiteStore.create({ data: { companyId: ids.companyB, siteId: ids.siteB, enabled: false, warehouseId: ids.warehouseB } });
    ids.aceite = (await prisma.product.create({ data: { companyId: ids.companyA, sku: 'ACE-900', name: 'Aceite 900 ml', netPrice: 8395, grossPrice: 9990, costPricePMP: 4000 } })).id;
    ids.productoB = (await prisma.product.create({ data: { companyId: ids.companyB, sku: 'PB-1', name: 'Producto de B', netPrice: 8395, grossPrice: 9990, costPricePMP: 4000 } })).id;
    await prisma.stock.createMany({ data: [{ companyId: ids.companyA, productId: ids.aceite, warehouseId: ids.warehouseA, quantity: 500 }, { companyId: ids.companyB, productId: ids.productoB, warehouseId: ids.warehouseB, quantity: 9 }] });
    await prisma.storeProduct.create({ data: { companyId: ids.companyA, siteId: ids.siteA, productId: ids.aceite, slug: 'aceite', published: true } });
  });

  beforeEach(() => {
    currentSession = null;
    auditCalls.length = 0;
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
        await prisma.user.deleteMany({ where: { companyId } });
        await prisma.company.delete({ where: { id: companyId } });
      } catch {
        /* la base de pruebas es descartable */
      }
    }
    await prisma.$disconnect();
  });

  // ── Permisos ─────────────────────────────────────────────────────────────

  describe('cada acción exige su permiso', () => {
    it('sin sesión nada responde datos', async () => {
      const result = await actions.listStoreOrdersAction({});
      expect(result.success).toBe(false);
    });

    it('leer necesita store:read; quien solo lee no cambia nada', async () => {
      const created = await place();
      asA(['store:read']);
      expect((await actions.listStoreOrdersAction({ siteId: ids.siteA })).success).toBe(true);
      expect((await actions.getStoreOrderAction(created.orderId)).success).toBe(true);
      expect((await actions.listStoreCatalogAction(ids.siteA, {})).success).toBe(true);
      expect((await actions.getStoreSettingsAction(ids.siteA)).success).toBe(true);

      for (const attempt of [
        () => actions.confirmOrderPaymentAction(created.orderId, {}),
        () => actions.fulfillOrderAction(created.orderId, { action: 'PREPARE' }),
        () => actions.cancelStoreOrderAction(created.orderId, { reason: 'prueba' }),
        () => actions.markOrderRefundedAction(created.orderId, {}),
        () => actions.retryOrderSaleAction(created.orderId),
        () => actions.reopenPaidOrderAction(created.orderId),
        () => actions.saveStoreProductAction(ids.siteA, ids.aceite, { title: 'x', summary: '', description: '', images: [], compareAtPrice: null, collection: '', featured: false, sortOrder: 0, maxPerOrder: null }),
        () => actions.setProductsPublishedAction(ids.siteA, { productIds: [ids.aceite], published: false }),
        () => actions.removeStoreProductAction(ids.siteA, ids.aceite),
        () => actions.setStoreOpenAction(ids.siteA, false),
      ]) {
        const result = await attempt();
        expect(result).toEqual({ success: false, error: expect.stringMatching(/No autorizado/) });
      }
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(order).toMatchObject({ status: 'OPEN', paymentStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' });
      expect(await prisma.storeProduct.count({ where: { siteId: ids.siteA, published: true } })).toBe(1);
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).enabled).toBe(true);
    });

    it('preparar y despachar es de store:fulfill; configurar es solo de store:manage', async () => {
      const created = await place();
      asA(['store:read', 'store:write']);
      expect((await actions.fulfillOrderAction(created.orderId, { action: 'PREPARE' })).success).toBe(false);
      asA(['store:read', 'store:write', 'store:fulfill']);
      // Sin pago confirmado no se puede preparar aunque se tenga el permiso (regla del estado).
      expect(await actions.fulfillOrderAction(created.orderId, { action: 'PREPARE' })).toMatchObject({ success: false, error: expect.stringMatching(/pago/i) });
      const settings = await actions.getStoreSettingsAction(ids.siteA);
      expect(settings.success).toBe(true);
      const draft = {
        warehouseId: ids.warehouseA, notifyEmail: '', supportPhone: '', pickupEnabled: true, pickupAddress: 'Av. Alemania 123', pickupInstructions: '', shippingEnabled: false, shippingRates: [],
        paymentMethods: ['TRANSFER'], bankTransferInfo: 'Banco', transferHoldHours: 48, webpayCommerceCode: '', webpayApiSecret: '', clearWebpaySecret: false, webpayProduction: false, invoiceEnabled: false, termsText: '', returnsText: '', minOrderAmount: 0,
      };
      expect((await actions.updateStoreSettingsAction(ids.siteA, draft)).success).toBe(false);
    });

    it('sin el módulo de la tienda, ni con todos los permisos', async () => {
      await prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasEcommerce: false } });
      try {
        asA();
        const result = await actions.listStoreOrdersAction({});
        expect(result.success).toBe(false);
      } finally {
        await prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasEcommerce: true } });
      }
    });
  });

  // ── Aislamiento entre empresas ───────────────────────────────────────────

  describe('una empresa no ve ni toca lo de otra', () => {
    it('pedidos, fichas, ajustes y apertura de otra empresa no existen', async () => {
      const created = await place();
      asB();
      expect(await actions.getStoreOrderAction(created.orderId)).toMatchObject({ success: false, error: 'Pedido no encontrado' });
      expect(await actions.confirmOrderPaymentAction(created.orderId, {})).toMatchObject({ success: false });
      expect(await actions.fulfillOrderAction(created.orderId, { action: 'PREPARE' })).toMatchObject({ success: false });
      expect(await actions.cancelStoreOrderAction(created.orderId, { reason: 'intento ajeno' })).toMatchObject({ success: false });
      expect(await actions.getStoreSettingsAction(ids.siteA)).toMatchObject({ success: false });
      expect(await actions.setStoreOpenAction(ids.siteA, false)).toMatchObject({ success: false });
      expect(await actions.listStoreCatalogAction(ids.siteA, {})).toMatchObject({ success: false });
      expect(await actions.setProductsPublishedAction(ids.siteA, { productIds: [ids.aceite], published: false })).toMatchObject({ success: false });
      expect(await actions.getStoreProductAction(ids.siteA, ids.aceite)).toMatchObject({ success: false });

      const list = await actions.listStoreOrdersAction({});
      expect(list.success && list.data.page.rows.some((row) => row.id === created.orderId)).toBe(false);
      expect(list.success && list.data.page.total).toBe(0);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } })).status).toBe('OPEN');
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).enabled).toBe(true);
    });

    it('no se puede publicar en la tienda de A un producto de B ni al revés', async () => {
      asA();
      const result = await actions.setProductsPublishedAction(ids.siteA, { productIds: [ids.productoB], published: true });
      expect(result.success).toBe(false);
      expect(await prisma.storeProduct.count({ where: { productId: ids.productoB } })).toBe(0);
    });
  });

  // ── Operación de un pedido ───────────────────────────────────────────────

  describe('atender un pedido', () => {
    it('confirmar el pago emite la venta del ERP, descuenta el stock y queda en la bitácora', async () => {
      const before = (await prisma.stock.findFirstOrThrow({ where: { companyId: ids.companyA, productId: ids.aceite } })).quantity;
      const created = await place({ lines: [{ productId: ids.aceite, quantity: 2 }] });
      asA(['store:read', 'store:write']);
      const result = await actions.confirmOrderPaymentAction(created.orderId, { method: 'TRANSFERENCIA', note: 'Transferencia 998877' });
      expect(result.success).toBe(true);
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId }, include: { salesDocument: true } });
      expect(order).toMatchObject({ paymentStatus: 'PAID', paymentReference: 'Transferencia 998877' });
      expect(order.salesDocument).toMatchObject({ status: 'ISSUED', totalAmount: order.total });
      expect((await prisma.stock.findFirstOrThrow({ where: { companyId: ids.companyA, productId: ids.aceite } })).quantity).toBe(before - 2);
      expect(auditCalls).toContainEqual(expect.objectContaining({ entity: 'StoreOrder', entityId: created.orderId, action: 'UPDATE', companyId: ids.companyA, userId: ids.userA }));

      // Confirmar dos veces no emite dos ventas.
      const again = await actions.confirmOrderPaymentAction(created.orderId, {});
      expect(again.success).toBe(false);
      expect(await prisma.salesDocument.count({ where: { companyId: ids.companyA, id: order.salesDocumentId! } })).toBe(1);
    });

    it('un medio de pago en línea no se confirma a mano', async () => {
      const created = await place();
      await prisma.storeOrder.update({ where: { id: created.orderId }, data: { paymentProvider: 'KHIPU' } });
      asA();
      expect(await actions.confirmOrderPaymentAction(created.orderId, {})).toMatchObject({ success: false, error: expect.stringMatching(/en línea/) });
    });

    it('prepara, despacha y entrega; el enlace de seguimiento debe ser https', async () => {
      const created = await place({ deliveryMethod: 'PICKUP' });
      await prisma.storeOrder.update({ where: { id: created.orderId }, data: { deliveryMethod: 'SHIPPING' } });
      asA();
      expect((await actions.confirmOrderPaymentAction(created.orderId, {})).success).toBe(true);
      expect((await actions.fulfillOrderAction(created.orderId, { action: 'PREPARE' })).success).toBe(true);
      expect(await actions.fulfillOrderAction(created.orderId, { action: 'SHIP', carrier: 'Starken', trackingNumber: 'A1', trackingUrl: 'javascript:alert(1)' })).toMatchObject({ success: false });
      expect((await actions.fulfillOrderAction(created.orderId, { action: 'SHIP', carrier: 'Starken', trackingNumber: 'A1', trackingUrl: 'https://starken.cl/seguimiento/A1' })).success).toBe(true);
      expect((await actions.fulfillOrderAction(created.orderId, { action: 'DELIVER' })).success).toBe(true);
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(order).toMatchObject({ fulfillmentStatus: 'DELIVERED', carrier: 'Starken', trackingNumber: 'A1', trackingUrl: 'https://starken.cl/seguimiento/A1' });
      // Un pedido entregado ya no se puede cancelar.
      expect(await actions.cancelStoreOrderAction(created.orderId, { reason: 'tarde' })).toMatchObject({ success: false });
    });

    it('cancelar un pedido pagado exige administración; uno sin pagar, no', async () => {
      const unpaid = await place();
      const paid = await place();
      asA(['store:read', 'store:write', 'store:fulfill']);
      expect((await actions.confirmOrderPaymentAction(paid.orderId, {})).success).toBe(true);
      expect(await actions.cancelStoreOrderAction(paid.orderId, { reason: 'El cliente se arrepintió' })).toMatchObject({ success: false, error: expect.stringMatching(/administrador/) });
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: paid.orderId } })).status).toBe('OPEN');
      expect((await actions.cancelStoreOrderAction(unpaid.orderId, { reason: 'Pedido duplicado' })).success).toBe(true);
      expect(await prisma.storeStockReservation.count({ where: { orderId: unpaid.orderId, status: 'ACTIVE' } })).toBe(0);

      asA();
      expect((await actions.cancelStoreOrderAction(paid.orderId, { reason: 'El cliente se arrepintió', refunded: true, refundNote: 'Devuelto por Khipu' })).success).toBe(true);
      expect(await prisma.storeOrder.findUniqueOrThrow({ where: { id: paid.orderId } })).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    });

    it('el reembolso a mano y reabrir un pedido pagado y cerrado son de administración', async () => {
      const created = await place();
      asA();
      expect((await actions.confirmOrderPaymentAction(created.orderId, {})).success).toBe(true);
      expect((await actions.cancelStoreOrderAction(created.orderId, { reason: 'Error en el pedido' })).success).toBe(true);
      asA(['store:read', 'store:write', 'store:fulfill']);
      expect((await actions.markOrderRefundedAction(created.orderId, { note: 'x' })).success).toBe(false);
      expect((await actions.reopenPaidOrderAction(created.orderId)).success).toBe(false);
      asA();
      expect((await actions.reopenPaidOrderAction(created.orderId)).success).toBe(true);
      expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } })).status).toBe('OPEN');
    });
  });

  // ── Ajustes y apertura ───────────────────────────────────────────────────

  describe('ajustes y apertura de la tienda', () => {
    const draft = (over: Record<string, unknown> = {}) => ({
      warehouseId: ids.warehouseA, notifyEmail: '', supportPhone: '+56 9 8765 4321', pickupEnabled: true, pickupAddress: 'Av. Alemania 123, Temuco', pickupInstructions: '', shippingEnabled: false, shippingRates: [],
      paymentMethods: ['TRANSFER'], bankTransferInfo: 'Banco Estado\nCuenta 123', transferHoldHours: 48, webpayCommerceCode: '', webpayApiSecret: '', clearWebpaySecret: false, webpayProduction: false, invoiceEnabled: false, termsText: '', returnsText: '', minOrderAmount: 0,
      ...over,
    });

    it('la llave de Webpay no vuelve al navegador ni a la bitácora', async () => {
      asA();
      const result = await actions.updateStoreSettingsAction(ids.siteA, draft({ paymentMethods: ['TRANSFER', 'WEBPAY'], webpayCommerceCode: '597055555532', webpayApiSecret: 'llave-super-secreta' }));
      expect(result.success).toBe(true);
      const text = JSON.stringify(result) + JSON.stringify(auditCalls);
      expect(text).not.toContain('llave-super-secreta');
      expect(text).not.toContain('secreto-webpay');
      expect(result.success && result.data.settings.webpayHasSecret).toBe(true);
      // Se guardó cifrada (no en claro) y vacío conserva la guardada.
      const stored = (await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).webpayApiSecret!;
      expect(stored).not.toContain('llave-super-secreta');
      await actions.updateStoreSettingsAction(ids.siteA, draft({ paymentMethods: ['TRANSFER', 'WEBPAY'], webpayCommerceCode: '597055555532', webpayApiSecret: '' }));
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).webpayApiSecret).toBe(stored);
      expect(auditCalls.filter((call) => call.entity === 'WebSiteStore')).not.toHaveLength(0);
    });

    it('datos inválidos responden un mensaje en español y no cambian nada', async () => {
      asA();
      const before = await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } });
      expect(await actions.updateStoreSettingsAction(ids.siteA, draft({ transferHoldHours: 0 }))).toMatchObject({ success: false });
      expect(await actions.updateStoreSettingsAction(ids.siteA, draft({ pickupEnabled: true, pickupAddress: '' }))).toMatchObject({ success: false, error: expect.stringMatching(/dirección/) });
      expect(await actions.updateStoreSettingsAction(ids.siteA, draft({ warehouseId: ids.warehouseB }))).toMatchObject({ success: false, error: expect.stringMatching(/bodega/i) });
      expect(await actions.updateStoreSettingsAction(ids.siteA, draft({ paymentMethods: ['PAY_ON_PICKUP'], pickupEnabled: false }))).toMatchObject({ success: false });
      const after = await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } });
      expect(after.updatedAt?.getTime?.() ?? 0).toBe(before.updatedAt?.getTime?.() ?? 0);
    });

    it('una tienda abierta que queda incompleta se cierra sola y se avisa', async () => {
      asA();
      const result = await actions.updateStoreSettingsAction(ids.siteA, draft({ paymentMethods: [], pickupEnabled: true }));
      expect(result).toMatchObject({ success: true, message: expect.stringMatching(/se cerró/) });
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).enabled).toBe(false);
      // Sin medio de pago no se puede abrir; con uno, sí.
      expect(await actions.setStoreOpenAction(ids.siteA, true)).toMatchObject({ success: false, error: expect.stringMatching(/Aún no se puede abrir/) });
      await actions.updateStoreSettingsAction(ids.siteA, draft());
      expect((await actions.setStoreOpenAction(ids.siteA, true)).success).toBe(true);
      expect((await prisma.webSiteStore.findUniqueOrThrow({ where: { siteId: ids.siteA } })).enabled).toBe(true);
    });
  });

  // ── Productos ────────────────────────────────────────────────────────────

  describe('productos', () => {
    const sheet = (over: Record<string, unknown> = {}) => ({ title: 'Aceite premium', summary: 'Prensado en frío', description: '', images: [], compareAtPrice: null, collection: 'Despensa', featured: true, sortOrder: 0, maxPerOrder: 5, ...over });

    it('guarda la ficha sin tocar precio ni stock, y rechaza fotos que no son de nuestro almacenamiento', async () => {
      asA();
      expect((await actions.saveStoreProductAction(ids.siteA, ids.aceite, sheet())).success).toBe(true);
      const product = await prisma.product.findUniqueOrThrow({ where: { id: ids.aceite } });
      expect(product).toMatchObject({ netPrice: 8395, grossPrice: 9990, name: 'Aceite 900 ml' });
      expect(await prisma.storeProduct.findFirstOrThrow({ where: { productId: ids.aceite, siteId: ids.siteA } })).toMatchObject({ title: 'Aceite premium', collection: 'Despensa', featured: true, maxPerOrder: 5 });
      expect(await actions.saveStoreProductAction(ids.siteA, ids.aceite, sheet({ images: [{ url: 'https://evil.example/foto.jpg', alt: 'x' }] }))).toMatchObject({ success: false });
      expect(await actions.saveStoreProductAction(ids.siteA, ids.aceite, sheet({ images: [{ url: `https://x.public.blob.vercel-storage.com/products/${ids.companyB}/ajena.jpg`, alt: 'de otra empresa' }] }))).toMatchObject({ success: false });
      // Un «precio anterior» menor al actual no se acepta (no sería un descuento).
      expect(await actions.saveStoreProductAction(ids.siteA, ids.aceite, sheet({ compareAtPrice: 5000 }))).toMatchObject({ success: false });
    });

    it('publica y despublica varios a la vez y lo deja en la bitácora', async () => {
      asA();
      const off = await actions.setProductsPublishedAction(ids.siteA, { productIds: [ids.aceite], published: false });
      expect(off).toMatchObject({ success: true, data: { count: 1 } });
      expect(await publicStore.listPublicProducts((await publicStore.resolvePublicStore(slugA))!, {})).toMatchObject({ total: 0 });
      const on = await actions.setProductsPublishedAction(ids.siteA, { productIds: [ids.aceite], published: true });
      expect(on.success).toBe(true);
      expect(auditCalls.filter((call) => call.entity === 'StoreProduct').length).toBeGreaterThanOrEqual(2);
      expect(await actions.setProductsPublishedAction(ids.siteA, { productIds: [], published: true })).toMatchObject({ success: false });
    });
  });

  // ── Excel ────────────────────────────────────────────────────────────────

  describe('exportación de pedidos a Excel', () => {
    const get = (query = '') => exportRoute.GET(new Request(`http://localhost/api/store/orders/export${query}`));

    async function sheetOf(response: Response) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()) as never);
      return workbook.getWorksheet('Pedidos')!;
    }

    it('sin sesión o sin permiso no entrega nada', async () => {
      expect((await get()).status).toBe(401);
      asA(['store:write']);
      expect((await get()).status).toBe(403);
    });

    it('descarga los pedidos de la empresa, no ejecuta fórmulas y deja la descarga auditada', async () => {
      const created = await place({ customer: { name: '=HYPERLINK("http://evil.example","clic")', email: `formula.${suffix}@correo.cl`, phone: '+56 9 1234 5678', rut: '' } });
      asA(['store:read']);
      const response = await get(`?siteId=${ids.siteA}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('spreadsheetml');
      expect(response.headers.get('Content-Disposition')).toContain('pedidos-tienda.xlsx');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const sheet = await sheetOf(response);
      const numbers: number[] = [];
      sheet.eachRow((row, index) => index > 1 && numbers.push(Number(row.getCell('A').value)));
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(numbers).toContain(order.number);
      const row = sheet.getRow(numbers.indexOf(order.number) + 2);
      expect(String(row.getCell('D').value)).toBe(`'=HYPERLINK("http://evil.example","clic")`);
      expect(auditCalls).toContainEqual(expect.objectContaining({ action: 'EXPORT', entity: 'StoreOrder', companyId: ids.companyA, userId: ids.userA }));
    });

    it('otra empresa descarga un archivo sin los pedidos ajenos, y los filtros se aplican', async () => {
      const created = await place();
      asB(['store:read']);
      const sheet = await sheetOf(await get());
      let rows = 0;
      sheet.eachRow((_row, index) => index > 1 && (rows += 1));
      expect(rows).toBe(0);

      asA(['store:read']);
      const closed = await sheetOf(await get('?view=closed'));
      const closedNumbers: number[] = [];
      closed.eachRow((row, index) => index > 1 && closedNumbers.push(Number(row.getCell('A').value)));
      const order = await prisma.storeOrder.findUniqueOrThrow({ where: { id: created.orderId } });
      expect(closedNumbers).not.toContain(order.number); // abierto: no está en «Cerrados»
      const found = await sheetOf(await get(`?q=${order.number}`));
      let foundRows = 0;
      found.eachRow((_row, index) => index > 1 && (foundRows += 1));
      expect(foundRows).toBe(1);
      expect((await get('?view=inventada')).status).toBe(400);
    });
  });

  // ── Páginas del sitio ────────────────────────────────────────────────────

  describe('un sitio con tienda reserva las direcciones de la tienda', () => {
    const page = (id: string, slug: string, title: string) => ({ id, title, slug, menuLabel: '', showInMenu: true, hidden: false, seoTitle: '', seoDescription: '', blocks: [] });

    it('rechaza una página NUEVA «carrito» pero deja guardar una «tienda» que ya existía', async () => {
      await prisma.webSite.update({ where: { id: ids.siteA }, data: { draftBlocks: JSON.parse(JSON.stringify({ pages: [page('home', '', 'Inicio'), page('old', 'tienda', 'Mi tienda anterior')] })) } });
      const site = await webSites.getWebSite(ids.companyA, ids.siteA);
      expect(site).not.toBeNull();
      const base = site!.document;
      // Nueva página con una dirección de la tienda: rechazada.
      await expect(webSites.saveWebSiteContent(ids.companyA, ids.siteA, { document: { ...base, pages: [...base.pages, { ...base.pages[0]!, id: 'nueva', slug: 'carrito', title: 'Carrito' }] } } as never)).rejects.toThrow(/direcci(ón|ones) de la tienda/);
      // Una dirección que ya existía antes de la tienda no impide guardar el resto.
      await expect(webSites.saveWebSiteContent(ids.companyA, ids.siteA, { document: { ...base, pages: [...base.pages, { ...base.pages[0]!, id: 'otra', slug: 'contacto', title: 'Contacto' }] } } as never)).resolves.toBeDefined();
    });

    it('un sitio SIN tienda puede tener una página «carrito» como siempre', async () => {
      const site = await webSites.getWebSite(ids.companyB, ids.siteB);
      const base = site!.document;
      await prisma.webSiteStore.deleteMany({ where: { siteId: ids.siteB } });
      await expect(webSites.saveWebSiteContent(ids.companyB, ids.siteB, { document: { ...base, pages: [...base.pages, { ...base.pages[0]!, id: 'c', slug: 'carrito', title: 'Carrito' }] } } as never)).resolves.toBeDefined();
    });
  });
});

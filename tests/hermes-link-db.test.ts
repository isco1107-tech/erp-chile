/**
 * Conexión con Hermes contra PostgreSQL REAL (mismas reglas de seguridad que
 * `tests/store-db.test.ts`: solo corre contra una base local cuyo nombre termina en `_test`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/erp_hermes_test \
 *     npx jest tests/hermes-link-db.test.ts
 *
 * Lo que protege: la llave identifica a UNA empresa (la otra no se ve ni se vende), el catálogo
 * nunca trae costos, la venta es una boleta con el precio del catálogo que descuenta el kardex
 * una sola vez aunque se reenvíe, el stock negativo sigue la configuración de la empresa, y una
 * llave regenerada o revocada deja de servir al instante.
 */
import type { PrismaClient } from '@prisma/client';
import { calculateTotal } from '@/lib/chile/tax';

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

describeDb('conexión con Hermes contra PostgreSQL', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let svc: typeof import('@/modules/hermes/services/hermes-link.service');
  const suffix = Math.random().toString(36).slice(2, 8);
  const ids = { companyA: '', companyB: '', warehouseA: '', warehouseA2: '', warehouseB: '', user: '', cera: '', libro: '', productoB: '', apagado: '' };
  let keyA = '';
  let keyB = '';
  let sequence = 0;
  const saleKey = () => `venta-${suffix}-${++sequence}`;
  const onHand = async (productId: string) => (await prisma.stock.findFirst({ where: { companyId: ids.companyA, productId, warehouseId: ids.warehouseA } }))?.quantity ?? 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    svc = await import('@/modules/hermes/services/hermes-link.service');

    const company = (n: number, name: string) =>
      prisma.company.create({ data: { rut: `77${suffix}${n}-${n}`, businessName: name, status: 'ACTIVE', features: { create: { hasInventory: true } }, settings: { create: {} } } });
    ids.companyA = (await company(1, `Barbería A ${suffix}`)).id;
    ids.companyB = (await company(2, `Barbería B ${suffix}`)).id;
    ids.warehouseA = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Local', code: 'LOC', isDefault: true } })).id;
    ids.warehouseA2 = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Bodega', code: 'BOD' } })).id;
    ids.warehouseB = (await prisma.warehouse.create({ data: { companyId: ids.companyB, name: 'Local B', code: 'LB', isDefault: true } })).id;
    ids.user = (await prisma.user.create({ data: { email: `dueno-${suffix}@test.cl`, passwordHash: 'x', name: 'Dueño', companyId: ids.companyA, role: 'OWNER' } })).id;

    const product = (companyId: string, sku: string, name: string, extra: Record<string, unknown> = {}) =>
      prisma.product.create({ data: { companyId, sku, name, netPrice: 8403, grossPrice: 10000, costPricePMP: 3000, ...extra } });
    ids.cera = (await product(ids.companyA, 'CERA-1', 'Cera mate 100 g')).id;
    ids.libro = (await product(ids.companyA, 'LIB-1', 'Libro de barbería', { isExempt: true, netPrice: 15000, grossPrice: 15000 })).id;
    ids.apagado = (await product(ids.companyA, 'OFF-1', 'Gel descontinuado', { isActive: false })).id;
    ids.productoB = (await product(ids.companyB, 'CERA-1', 'Cera de la empresa B')).id;
    await prisma.stock.createMany({
      data: [
        { companyId: ids.companyA, productId: ids.cera, warehouseId: ids.warehouseA, quantity: 5 },
        { companyId: ids.companyA, productId: ids.libro, warehouseId: ids.warehouseA, quantity: 2 },
        { companyId: ids.companyB, productId: ids.productoB, warehouseId: ids.warehouseB, quantity: 9 },
      ],
    });

    keyA = await svc.issueHermesKey(ids.companyA, ids.warehouseA, ids.user);
    keyB = await svc.issueHermesKey(ids.companyB, ids.warehouseB, ids.user);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('la llave identifica a la empresa; en la base solo queda su hash', async () => {
    const ctx = await svc.resolveHermesLink(keyA);
    expect(ctx).toMatchObject({ companyId: ids.companyA, warehouseId: ids.warehouseA });
    const row = await prisma.hermesLink.findUnique({ where: { companyId: ids.companyA } });
    expect(row?.keyHash).not.toContain(keyA);
    expect(row?.keyPrefix).toBe(keyA.slice(0, 9));
    expect(await svc.resolveHermesLink('hk_no-existe-esta-llave-para-nada')).toBeNull();
  });

  it('el catálogo es de SU empresa, con precio con IVA y stock de su bodega, sin costos', async () => {
    const ctx = (await svc.resolveHermesLink(keyA))!;
    const products = await svc.listHermesProducts(ctx, { q: 'cera', limit: 30 });
    expect(products).toEqual([{ id: ids.cera, sku: 'CERA-1', name: 'Cera mate 100 g', unit: 'UN', isExempt: false, grossPrice: 10000, stock: 5 }]);
    expect(JSON.stringify(products)).not.toMatch(/3000|costPricePMP|Cera de la empresa B/);
    const all = await svc.listHermesProducts(ctx, { limit: 30 });
    expect(all.map((p) => p.id)).not.toContain(ids.apagado);
    expect(all.find((p) => p.id === ids.libro)).toMatchObject({ isExempt: true, grossPrice: 15000 });
  });

  it('la venta es una boleta con el precio del catálogo y descuenta el kardex UNA vez aunque se reenvíe', async () => {
    const ctx = (await svc.resolveHermesLink(keyA))!;
    const key = saleKey();
    const input = { idempotencyKey: key, paymentMethod: 'EFECTIVO' as const, items: [{ productId: ids.cera, quantity: 2 }] };
    const first = await svc.createHermesSale(ctx, input);
    // El IVA se redondea una vez sobre el neto del documento (sales/calc.ts), igual que el POS:
    // 2 × 8.403 = 16.806 neto → 19.999, no 2 × 10.000. Hermes muestra el total que devuelve el ERP.
    expect(first).toMatchObject({ dteType: 'BOLETA_39', totalAmount: calculateTotal(8403 * 2), replayed: false });
    expect(first.totalAmount).toBe(19999);
    expect(await onHand(ids.cera)).toBe(3);

    const [again, parallel] = await Promise.all([svc.createHermesSale(ctx, input), svc.createHermesSale(ctx, input)]);
    expect(again).toMatchObject({ salesDocumentId: first.salesDocumentId, replayed: true });
    expect(parallel.salesDocumentId).toBe(first.salesDocumentId);
    expect(await onHand(ids.cera)).toBe(3);
    const doc = await prisma.salesDocument.findUnique({ where: { id: first.salesDocumentId }, include: { contact: true } });
    expect(doc).toMatchObject({ companyId: ids.companyA, warehouseId: ids.warehouseA, status: 'ISSUED' });
    expect(doc?.contact.rut).toBe('66.666.666-6');
  });

  it('todo exento → boleta exenta (41)', async () => {
    const ctx = (await svc.resolveHermesLink(keyA))!;
    const sale = await svc.createHermesSale(ctx, { idempotencyKey: saleKey(), paymentMethod: 'TARJETA_DEBITO', items: [{ productId: ids.libro, quantity: 1 }] });
    expect(sale).toMatchObject({ dteType: 'BOLETA_EXENTA_41', totalAmount: 15000 });
  });

  it('no se vende un producto de otra empresa ni uno desactivado', async () => {
    const ctx = (await svc.resolveHermesLink(keyA))!;
    await expect(svc.createHermesSale(ctx, { idempotencyKey: saleKey(), paymentMethod: 'EFECTIVO', items: [{ productId: ids.productoB, quantity: 1 }] })).rejects.toThrow(/no existe en el ERP/);
    await expect(svc.createHermesSale(ctx, { idempotencyKey: saleKey(), paymentMethod: 'EFECTIVO', items: [{ productId: ids.apagado, quantity: 1 }] })).rejects.toThrow(/desactivado/);
    expect((await prisma.stock.findFirst({ where: { productId: ids.productoB } }))?.quantity).toBe(9);
  });

  it('sin stock: se rechaza con el motivo, salvo que la empresa permita stock negativo', async () => {
    const ctx = (await svc.resolveHermesLink(keyA))!;
    await expect(svc.createHermesSale(ctx, { idempotencyKey: saleKey(), paymentMethod: 'EFECTIVO', items: [{ productId: ids.cera, quantity: 50 }] })).rejects.toThrow(/Stock insuficiente/);
    expect(await onHand(ids.cera)).toBe(3);
    await prisma.companySettings.update({ where: { companyId: ids.companyA }, data: { allowNegativeStock: true } });
    await svc.createHermesSale(ctx, { idempotencyKey: saleKey(), paymentMethod: 'EFECTIVO', items: [{ productId: ids.cera, quantity: 4 }] });
    expect(await onHand(ids.cera)).toBe(-1);
    await prisma.companySettings.update({ where: { companyId: ids.companyA }, data: { allowNegativeStock: false } });
  });

  it('cambiar la bodega solo acepta bodegas propias; regenerar o revocar corta la llave anterior', async () => {
    await expect(svc.changeHermesWarehouse(ids.companyA, ids.warehouseB)).rejects.toThrow(/no es de tu empresa/);
    await svc.changeHermesWarehouse(ids.companyA, ids.warehouseA2);
    expect((await svc.resolveHermesLink(keyA))?.warehouseId).toBe(ids.warehouseA2);

    const nueva = await svc.issueHermesKey(ids.companyA, ids.warehouseA, ids.user);
    expect(await svc.resolveHermesLink(keyA)).toBeNull();
    expect((await svc.resolveHermesLink(nueva))?.companyId).toBe(ids.companyA);
    expect((await svc.resolveHermesLink(keyB))?.companyId).toBe(ids.companyB);

    await svc.revokeHermesKey(ids.companyA);
    expect(await svc.resolveHermesLink(nueva)).toBeNull();
  });

  it('una empresa suspendida o sin Inventario no opera con su llave', async () => {
    await prisma.company.update({ where: { id: ids.companyB }, data: { status: 'SUSPENDED' } });
    expect(await svc.resolveHermesLink(keyB)).toBeNull();
    await prisma.company.update({ where: { id: ids.companyB }, data: { status: 'ACTIVE' } });
    await prisma.companyFeatures.update({ where: { companyId: ids.companyB }, data: { hasInventory: false } });
    expect(await svc.resolveHermesLink(keyB)).toBeNull();
  });
});

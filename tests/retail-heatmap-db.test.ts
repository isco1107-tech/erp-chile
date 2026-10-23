/**
 * Mapa de calor contra una base PostgreSQL REAL: los precios cobrados salen de
 * las ventas emitidas (descuento incluido) con SQL, y la venta por período del
 * kardex.
 *
 *   RETAIL_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/retail-heatmap-db.test.ts
 *
 * Se niega a correr si el servidor no es local o si la base no termina en
 * `_test` (la base del `.env` del proyecto ES la de producción, CLAUDE.md §5).
 */
import type { DocumentStatus, DteType, PrismaClient } from '@prisma/client';
import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';

const TEST_URL = process.env.RETAIL_TEST_DATABASE_URL;

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

describeDb('Mapa de calor contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let stock: typeof import('@/modules/inventory/services/stock.service');
  let getHeatmap: typeof import('@/modules/retail/services/heatmap.service').getHeatmap;

  const suffix = Math.random().toString(36).slice(2, 8);
  const now = new Date();
  let companyA = '';
  let companyB = '';
  let w1 = '';
  let w2 = '';
  let wB = '';
  let customerA = '';
  let customerB = '';
  let product = '';
  let productB = '';

  const dayKeyAgo = (daysAgo: number) => {
    const today = santiagoDateParts(now);
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day - daysAgo));
    return date.toISOString().slice(0, 10);
  };
  const at = (daysAgo: number, hour = 12) => {
    const [y, m, d] = dayKeyAgo(daysAgo).split('-').map(Number) as [number, number, number];
    return new Date(santiagoMidnightUtc(y, m, d).getTime() + hour * 3_600_000);
  };

  let folio = 1;
  async function sale(companyId: string, contactId: string, warehouseId: string, productId: string, quantity: number, unitPrice: number, when: Date, extra: { discountPercent?: number; dteType?: DteType; status?: DocumentStatus } = {}) {
    const subtotal = Math.round(quantity * unitPrice * (1 - (extra.discountPercent ?? 0) / 100));
    await prisma.salesDocument.create({
      data: {
        companyId,
        contactId,
        warehouseId,
        dteType: extra.dteType ?? 'BOLETA_39',
        folio: folio++,
        status: extra.status ?? 'ISSUED',
        issueDate: when,
        paymentMethod: 'EFECTIVO',
        netAmount: subtotal,
        totalAmount: subtotal,
        items: { create: { companyId, productId, description: 'Línea de prueba', quantity, unitPrice, discountPercent: extra.discountPercent ?? 0, subtotal, iva: 0, total: subtotal } },
      },
    });
  }
  const backdate = (id: string, when: Date) => prisma.inventoryMovement.update({ where: { id }, data: { createdAt: when } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    stock = await import('@/modules/inventory/services/stock.service');
    ({ getHeatmap } = await import('@/modules/retail/services/heatmap.service'));

    companyA = (await prisma.company.create({ data: { rut: `78${suffix}1-1`, businessName: `Mapa A ${suffix}` } })).id;
    companyB = (await prisma.company.create({ data: { rut: `78${suffix}2-2`, businessName: `Mapa B ${suffix}` } })).id;
    w1 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Sala', code: 'SALA', isDefault: true } })).id;
    w2 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Otra sala', code: 'OTRA' } })).id;
    wB = (await prisma.warehouse.create({ data: { companyId: companyB, name: 'Central B', code: 'CEN', isDefault: true } })).id;
    const contact = (companyId: string, rut: string) => prisma.contact.create({ data: { companyId, razonSocial: 'Consumidor final', rut, rutClean: rut.replace(/[.-]/g, ''), isCustomer: true } }).then((c) => c.id);
    customerA = await contact(companyA, '66.666.666-6');
    customerB = await contact(companyB, '66.666.666-6');
    product = (await prisma.product.create({ data: { companyId: companyA, sku: `MIEL-${suffix}`, name: 'Miel de ulmo', netPrice: 1000, grossPrice: 1190 } })).id;
    productB = (await prisma.product.create({ data: { companyId: companyB, sku: `MIEL-${suffix}`, name: 'Miel de otra empresa', netPrice: 1000, grossPrice: 1190 } })).id;

    await backdate((await stock.registerStockIn(companyA, { productId: product, warehouseId: w1, type: 'PURCHASE_IN', quantity: 100, unitCost: 500 })).id, at(45));
    // 10 días a $1.000 (2 por día), después 10 días a $900 cobrados como $1.000 con 10% de descuento (3 por día).
    for (let d = 30; d >= 11; d -= 1) {
      const qty = d > 20 ? 2 : 3;
      await backdate((await stock.registerStockOut(companyA, { productId: product, warehouseId: w1, type: 'SALE_OUT', quantity: qty })).id, at(d));
      await sale(companyA, customerA, w1, product, qty, 1000, at(d), { discountPercent: d > 20 ? 0 : 10 });
    }
    // Ruido que NO debe contar como precio cobrado: anulada, nota de crédito, otra bodega y otra empresa.
    for (let d = 19; d >= 11; d -= 1) {
      await sale(companyA, customerA, w1, product, 50, 5000, at(d, 13), { status: 'CANCELLED' });
      await sale(companyA, customerA, w1, product, 50, 5000, at(d, 14), { dteType: 'NOTA_CREDITO_61' });
      await sale(companyA, customerA, w2, product, 50, 5000, at(d, 15));
      await sale(companyB, customerB, wB, productB, 50, 5000, at(d, 16));
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [companyA, companyB].filter(Boolean)) {
      await prisma.salesDocumentItem.deleteMany({ where: { companyId } });
      await prisma.salesDocument.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  it('detecta el cambio de precio cobrado (descuento incluido) y la reacción de la venta', async () => {
    const data = await getHeatmap(companyA, { warehouseId: w1, grain: 'semana', order: 'mas' }, now);
    expect(data.reactions).toHaveLength(1);
    expect(data.reactions[0]).toMatchObject({ productId: product, day: dayKeyAgo(20), from: 1000, to: 900, status: 'OK', daysBefore: 14, daysAfter: 14 });
    // Los 14 días con stock de cada lado incluyen días con stock y sin venta (antes de la primera venta y
    // después de la última): cuentan como cero, porque había producto.
    expect(data.reactions[0]!.velocityBefore).toBeCloseTo(20 / 14, 5);
    expect(data.reactions[0]!.velocityAfter).toBeCloseTo(30 / 14, 5);
    expect(data.reactions[0]!.volumeChangePct).toBeCloseTo(50, 5);
  });

  it('el mapa suma la venta del kardex por semana', async () => {
    const data = await getHeatmap(companyA, { warehouseId: w1, grain: 'semana', order: 'mas' }, now);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ productId: product, total: 50 });
    expect(data.rows[0]!.cells.reduce((sum, cell) => sum + cell.sold, 0)).toBe(50);
    expect(data.max).toBeGreaterThan(0);
    const daily = await getHeatmap(companyA, { warehouseId: w1, grain: 'dia', order: 'mas' }, now);
    // La última celda es hoy: la de hace 11 días es la última venta (3 unidades).
    expect(daily.rows[0]!.cells.at(-12)!.sold).toBe(3);
    expect(daily.rows[0]!.cells.at(-11)!.sold).toBe(0);
  });

  it('cada bodega y cada empresa por separado', async () => {
    const other = await getHeatmap(companyA, { warehouseId: w2, grain: 'semana', order: 'mas' }, now);
    expect(other.rows).toEqual([]);
    expect(other.reactions).toEqual([]);
    expect((await getHeatmap(companyA, { warehouseId: wB, grain: 'semana', order: 'mas' }, now)).rows).toEqual([]);
  });
});

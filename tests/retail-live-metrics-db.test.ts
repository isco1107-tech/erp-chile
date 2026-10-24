/**
 * "Retail en vivo" contra una base PostgreSQL REAL: la agregación por día del
 * kardex (zona horaria de Santiago, devoluciones de venta, traslados) es SQL y
 * solo se puede comprobar contra Postgres.
 *
 * No corre en `npm test` normal. Para correrla:
 *
 *   RETAIL_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/retail-live-metrics-db.test.ts
 *
 * La base debe tener las migraciones aplicadas (`prisma migrate deploy`). Se
 * niega a correr si el servidor no es local o si la base no termina en `_test`
 * (la base del `.env` del proyecto ES la de producción, ver CLAUDE.md §5).
 */
import type { PrismaClient } from '@prisma/client';
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

describeDb('Retail en vivo contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let stock: typeof import('@/modules/inventory/services/stock.service');
  let getLiveMetrics: typeof import('@/modules/retail/services/live-metrics.service').getLiveMetrics;
  let liveMetricsFacets: typeof import('@/modules/retail/services/live-metrics.service').liveMetricsFacets;

  const suffix = Math.random().toString(36).slice(2, 8);
  const now = new Date();
  let companyA = '';
  let companyB = '';
  let whA1 = '';
  let whA2 = '';
  let whB = '';
  let supplier = '';
  let category = '';
  const products: Record<'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'other', string> = { p1: '', p2: '', p3: '', p4: '', p5: '', other: '' };

  /** Instante dentro del día `daysAgo` (0 = hoy) en Santiago, a la hora indicada. */
  const at = (daysAgo: number, hour = 12, minute = 0) => {
    const today = santiagoDateParts(now);
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day - daysAgo));
    const midnight = santiagoMidnightUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    const instant = new Date(midnight.getTime() + (hour * 60 + minute) * 60_000);
    // Hoy no puede quedar en el futuro: la consulta mira hasta ahora.
    return instant > now ? new Date(now.getTime() - 60_000) : instant;
  };
  const backdate = (id: string, createdAt: Date) => prisma.inventoryMovement.update({ where: { id }, data: { createdAt } });

  const stockIn = async (companyId: string, productId: string, warehouseId: string, quantity: number, when: Date, extra: { type?: 'PURCHASE_IN' | 'ADJUSTMENT_IN'; reference?: string } = {}) =>
    backdate((await stock.registerStockIn(companyId, { productId, warehouseId, type: extra.type ?? 'PURCHASE_IN', quantity, unitCost: 100, reference: extra.reference })).id, when);
  const stockOut = async (companyId: string, productId: string, warehouseId: string, quantity: number, when: Date, extra: { type?: 'SALE_OUT' | 'ADJUSTMENT_OUT'; reasonCode?: string } = {}) =>
    backdate((await stock.registerStockOut(companyId, { productId, warehouseId, type: extra.type ?? 'SALE_OUT', quantity, reasonCode: extra.reasonCode })).id, when);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    stock = await import('@/modules/inventory/services/stock.service');
    ({ getLiveMetrics, liveMetricsFacets } = await import('@/modules/retail/services/live-metrics.service'));

    companyA = (await prisma.company.create({ data: { rut: `76${suffix}1-1`, businessName: `Retail Test A ${suffix}` } })).id;
    companyB = (await prisma.company.create({ data: { rut: `76${suffix}2-2`, businessName: `Retail Test B ${suffix}` } })).id;
    whA1 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Sala de ventas', code: 'SALA', isDefault: true } })).id;
    whA2 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Trastienda', code: 'TRAS' } })).id;
    whB = (await prisma.warehouse.create({ data: { companyId: companyB, name: 'Central B', code: 'CEN', isDefault: true } })).id;
    category = (await prisma.category.create({ data: { companyId: companyA, name: `Lácteos ${suffix}` } })).id;
    supplier = (await prisma.contact.create({ data: { companyId: companyA, razonSocial: 'Quesería del Valle', rut: `77.${suffix.slice(0, 3)}.001-1`, rutClean: `77${suffix.slice(0, 3)}0011`, isSupplier: true } })).id;

    const product = (companyId: string, sku: string, name: string, extra: { categoryId?: string } = {}) =>
      prisma.product.create({ data: { companyId, sku, name, netPrice: 1000, grossPrice: 1190, ...extra } }).then((p) => p.id);
    products.p1 = await product(companyA, 'QUE-1', 'Queso de cabra', { categoryId: category });
    products.p2 = await product(companyA, 'MIE-1', 'Miel de ulmo');
    products.p3 = await product(companyA, 'MER-1', 'Mermelada de murta');
    products.p4 = await product(companyA, 'PAN-1', 'Pan amasado');
    products.p5 = await product(companyA, 'CAF-1', 'Café de grano');
    products.other = await product(companyB, 'QUE-1', 'Queso de otra empresa');
    await prisma.productSupplier.create({ data: { companyId: companyA, productId: products.p1, supplierId: supplier } });

    // P1: abre con 30 (antes del período) y vive una semana movida.
    await stockIn(companyA, products.p1, whA1, 30, at(10));
    await stockOut(companyA, products.p1, whA1, 5, at(6));
    await stockIn(companyA, products.p1, whA1, 20, at(5));
    await stockOut(companyA, products.p1, whA1, 10, at(4));
    await stockIn(companyA, products.p1, whA1, 2, at(3), { type: 'ADJUSTMENT_IN', reference: 'DTE Nota de Crédito Electrónica Folio #9' });
    await stockOut(companyA, products.p1, whA1, 3, at(2), { type: 'ADJUSTMENT_OUT', reasonCode: 'EXPIRED' });
    const transfer = await stock.registerTransfer(companyA, { productId: products.p1, fromWarehouseId: whA1, toWarehouseId: whA2, quantity: 4 });
    await backdate(transfer.out.id, at(1));
    await backdate(transfer.in.id, at(1));
    await stockOut(companyA, products.p1, whA1, 1, at(0, 0, 30));

    // P2: llega y se agota el mismo día; después no vuelve.
    await stockIn(companyA, products.p2, whA1, 5, at(6, 9));
    await stockOut(companyA, products.p2, whA1, 5, at(6, 18));

    // P3: stock de antes, sin movimientos en el período.
    await stockIn(companyA, products.p3, whA1, 7, at(10));

    // P4: una venta anulada no es venta ni llegada.
    await stockIn(companyA, products.p4, whA1, 10, at(10));
    await stockOut(companyA, products.p4, whA1, 6, at(2, 10));
    await stockIn(companyA, products.p4, whA1, 6, at(2, 11), { type: 'ADJUSTMENT_IN', reference: 'Anulación (error de digitación): DTE Boleta Electrónica Folio #3' });

    // P5: vendido a las 23:30 de ayer en Chile (ya es hoy en UTC): cuenta para ayer.
    await stockIn(companyA, products.p5, whA1, 10, at(10));
    await stockOut(companyA, products.p5, whA1, 2, at(1, 23, 30));

    // Otra empresa con el mismo SKU y ventas: nunca se mezcla.
    await stockIn(companyB, products.other, whB, 50, at(10));
    await stockOut(companyB, products.other, whB, 40, at(3));
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [companyA, companyB].filter(Boolean)) {
      await prisma.inventoryLot.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.productSupplier.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.category.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  const metrics = (companyId: string, warehouseId: string, extra: { categoryId?: string; supplierId?: string } = {}) =>
    getLiveMetrics(companyId, { warehouseId, periodDays: 7, lowCoverageDays: 7, ...extra }, now);
  const rowOf = (rows: Awaited<ReturnType<typeof metrics>>['rows'], productId: string) => rows.find((row) => row.productId === productId);

  it('ventas, devoluciones, llegadas, mermas y traslados caen donde corresponde', async () => {
    const { rows } = await metrics(companyA, whA1);
    const p1 = rowOf(rows, products.p1)!;
    expect(p1.stock).toBe(29);
    expect(p1.sold).toBe(14);
    expect(p1.soldToday).toBe(1);
    expect(p1.received).toBe(20);
    expect(p1.sellThroughPct).toBeCloseTo(28, 5);
    expect(p1.availableDays).toBe(7);
    expect(p1.dailyVelocity).toBeCloseTo(13 / 7, 5);
    expect(p1.coverageDays).toBe(15);
    expect(p1.status).toBe('OK');
  });

  it('un producto agotado no suma días sin demanda y queda como agotado con demanda', async () => {
    const { rows, summary } = await metrics(companyA, whA1);
    const p2 = rowOf(rows, products.p2)!;
    expect(p2).toMatchObject({ stock: 0, sold: 5, availableDays: 1, dailyVelocity: 5, coverageDays: 0, status: 'OUT' });
    expect(summary.outWithDemand).toBe(1);
  });

  it('sin movimientos en el período: sin ventas y sin días restantes inventados', async () => {
    const { rows } = await metrics(companyA, whA1);
    expect(rowOf(rows, products.p3)).toMatchObject({ stock: 7, sold: 0, received: 0, availableDays: 7, dailyVelocity: null, coverageDays: null, status: 'NO_SALES' });
  });

  it('una venta anulada se descuenta y su reingreso no cuenta como llegada', async () => {
    const { rows } = await metrics(companyA, whA1);
    expect(rowOf(rows, products.p4)).toMatchObject({ stock: 10, sold: 0, received: 0 });
  });

  it('el día se corta a medianoche de Santiago, no de UTC', async () => {
    const { rows } = await metrics(companyA, whA1);
    expect(rowOf(rows, products.p5)).toMatchObject({ sold: 2, soldToday: 0 });
  });

  it('cada bodega por separado: el traslado es una entrada en la de destino, no una venta', async () => {
    const { rows } = await metrics(companyA, whA2);
    expect(rows).toHaveLength(1);
    expect(rowOf(rows, products.p1)).toMatchObject({ stock: 4, sold: 0, received: 4, status: 'NO_SALES' });
  });

  it('filtra por categoría y por proveedor', async () => {
    expect((await metrics(companyA, whA1, { categoryId: category })).rows.map((row) => row.productId)).toEqual([products.p1]);
    expect((await metrics(companyA, whA1, { supplierId: supplier })).rows.map((row) => row.productId)).toEqual([products.p1]);
    const facets = await liveMetricsFacets(companyA);
    expect(facets.suppliers.map((entry) => entry.id)).toEqual([supplier]);
    expect(facets.categories.map((entry) => entry.id)).toEqual([category]);
  });

  it('nunca mezcla empresas, ni aunque se pida la bodega de otra', async () => {
    const { rows } = await metrics(companyA, whA1);
    expect(rowOf(rows, products.other)).toBeUndefined();
    expect((await metrics(companyA, whB)).rows).toEqual([]);
    expect((await metrics(companyA, whA1, { categoryId: category, supplierId: supplier })).rows).toHaveLength(1);
    const b = await metrics(companyB, whB);
    expect(b.rows.map((row) => row.productId)).toEqual([products.other]);
    expect(rowOf(b.rows, products.other)).toMatchObject({ sold: 40, stock: 10 });
  });
});

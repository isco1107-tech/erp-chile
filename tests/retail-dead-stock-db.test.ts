/**
 * Stock muerto contra una base PostgreSQL REAL: qué cuenta como rotación y
 * desde cuándo corre el reloj sale del kardex con SQL.
 *
 *   RETAIL_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/retail-dead-stock-db.test.ts
 *
 * Se niega a correr si el servidor no es local o si la base no termina en
 * `_test` (la base del `.env` del proyecto ES la de producción, CLAUDE.md §5).
 */
import type { PrismaClient } from '@prisma/client';

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

describeDb('Stock muerto contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let stock: typeof import('@/modules/inventory/services/stock.service');
  let getDeadStock: typeof import('@/modules/retail/services/dead-stock.service').getDeadStock;
  let alertDeadStock: typeof import('@/modules/retail/services/dead-stock-alerts.service').alertDeadStock;
  let saveDeadStockSettings: typeof import('@/modules/retail/services/retail-settings.service').saveDeadStockSettings;

  const DAY = 86_400_000;
  const NOW = new Date();
  /** `days` días completos antes de NOW (más una hora, para que el piso dé justo `days`). */
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY - 3_600_000);
  const suffix = Math.random().toString(36).slice(2, 8);
  let companyA = '';
  let companyB = '';
  let w1 = '';
  let w2 = '';
  let wB = '';
  const p: Record<string, string> = {};

  const backdate = (id: string, when: Date) => prisma.inventoryMovement.update({ where: { id }, data: { createdAt: when } });
  const arrive = async (companyId: string, productId: string, warehouseId: string, quantity: number, when: Date, lots?: Array<{ lotNumber: string; expiryDate: Date; quantity: number }>) =>
    backdate((await stock.registerStockIn(companyId, { productId, warehouseId, type: 'PURCHASE_IN', quantity, unitCost: 1000, lots })).id, when);
  const leave = async (companyId: string, productId: string, warehouseId: string, quantity: number, when: Date, type: 'SALE_OUT' | 'ADJUSTMENT_OUT' = 'SALE_OUT') =>
    backdate((await stock.registerStockOut(companyId, { productId, warehouseId, type, quantity, reasonCode: type === 'ADJUSTMENT_OUT' ? 'DAMAGED' : undefined })).id, when);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    stock = await import('@/modules/inventory/services/stock.service');
    ({ getDeadStock } = await import('@/modules/retail/services/dead-stock.service'));
    ({ alertDeadStock } = await import('@/modules/retail/services/dead-stock-alerts.service'));
    ({ saveDeadStockSettings } = await import('@/modules/retail/services/retail-settings.service'));

    companyA = (await prisma.company.create({ data: { rut: `77${suffix}1-1`, businessName: `Stock Muerto A ${suffix}` } })).id;
    companyB = (await prisma.company.create({ data: { rut: `77${suffix}2-2`, businessName: `Stock Muerto B ${suffix}` } })).id;
    w1 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Sala', code: 'SALA', isDefault: true } })).id;
    w2 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Trastienda', code: 'TRAS' } })).id;
    wB = (await prisma.warehouse.create({ data: { companyId: companyB, name: 'Central B', code: 'CEN', isDefault: true } })).id;
    const product = async (key: string, companyId = companyA, extra: { tracksLots?: boolean } = {}) => {
      p[key] = (await prisma.product.create({ data: { companyId, sku: `${key}-${suffix}`, name: `Producto ${key}`, netPrice: 2000, grossPrice: 2380, ...extra } })).id;
    };
    for (const key of ['neverSold', 'recent', 'soldRecently', 'soldLongAgo', 'longStopped', 'restockFromZero', 'restockOnTop', 'transferred', 'wasteOnly', 'milestone']) await product(key);
    await product('expiring', companyA, { tracksLots: true });
    await product('other', companyB);

    await arrive(companyA, p.neverSold!, w1, 6, ago(40));
    await arrive(companyA, p.recent!, w1, 6, ago(5));
    await arrive(companyA, p.soldRecently!, w1, 6, ago(60));
    await leave(companyA, p.soldRecently!, w1, 1, ago(10));
    await arrive(companyA, p.soldLongAgo!, w1, 6, ago(100));
    await leave(companyA, p.soldLongAgo!, w1, 1, ago(50));
    await arrive(companyA, p.longStopped!, w1, 6, ago(200));
    await leave(companyA, p.longStopped!, w1, 1, ago(120));
    await arrive(companyA, p.restockFromZero!, w1, 2, ago(100));
    await leave(companyA, p.restockFromZero!, w1, 2, ago(70));
    await arrive(companyA, p.restockFromZero!, w1, 4, ago(10));
    await arrive(companyA, p.restockOnTop!, w1, 5, ago(100));
    await arrive(companyA, p.restockOnTop!, w1, 5, ago(10));
    await arrive(companyA, p.transferred!, w1, 10, ago(60));
    const transfer = await stock.registerTransfer(companyA, { productId: p.transferred!, fromWarehouseId: w1, toWarehouseId: w2, quantity: 4 });
    await backdate(transfer.out.id, ago(10));
    await backdate(transfer.in.id, ago(10));
    await arrive(companyA, p.wasteOnly!, w1, 8, ago(40));
    await leave(companyA, p.wasteOnly!, w1, 2, ago(5), 'ADJUSTMENT_OUT');
    await arrive(companyA, p.milestone!, w1, 3, ago(30));
    await arrive(companyA, p.expiring!, w1, 4, ago(40), [{ lotNumber: 'L-1', expiryDate: new Date(NOW.getTime() + 10 * DAY), quantity: 4 }]);
    await arrive(companyB, p.other!, wB, 9, ago(200));
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [companyA, companyB].filter(Boolean)) {
      await prisma.workflowNotification.deleteMany({ where: { companyId } });
      await prisma.retailSettings.deleteMany({ where: { companyId } });
      await prisma.inventoryLot.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  const dead = (warehouseId: string, includeCosts = false, companyId = companyA) => getDeadStock(companyId, { warehouseId, thresholdDays: 30 }, { includeCosts }, NOW);
  const byId = (rows: Awaited<ReturnType<typeof dead>>['rows']) => new Map(rows.map((row) => [row.productId, row]));

  it('marca lo detenido y deja fuera lo que rotó o acaba de llegar', async () => {
    const rows = byId((await dead(w1)).rows);
    expect(rows.get(p.neverSold!)).toMatchObject({ daysStopped: 40, neverSold: true, suggestion: 'NEVER_SOLD', stock: 6 });
    expect(rows.get(p.soldLongAgo!)).toMatchObject({ daysStopped: 50, neverSold: false, suggestion: 'STOPPED' });
    expect(rows.get(p.milestone!)).toMatchObject({ daysStopped: 30 });
    expect(rows.get(p.longStopped!)).toMatchObject({ daysStopped: 120, suggestion: 'LONG_STOPPED' });
    for (const key of ['recent', 'soldRecently', 'restockFromZero', 'transferred']) expect(rows.has(p[key]!)).toBe(false);
  });

  it('una reposición sobre stock que ya estaba no reinicia el reloj; una merma no es rotación', async () => {
    const rows = byId((await dead(w1)).rows);
    expect(rows.get(p.restockOnTop!)).toMatchObject({ daysStopped: 100, stock: 10, suggestion: 'NEVER_SOLD' });
    expect(rows.get(p.wasteOnly!)).toMatchObject({ daysStopped: 40, stock: 6 });
  });

  it('un lote por vencer manda en la sugerencia', async () => {
    const row = byId((await dead(w1)).rows).get(p.expiring!);
    expect(row).toMatchObject({ suggestion: 'EXPIRING' });
    expect(row?.daysToExpiry).toBeGreaterThanOrEqual(9);
    expect(row?.daysToExpiry).toBeLessThanOrEqual(10);
  });

  it('el valor detenido solo sale si se pueden ver costos', async () => {
    const withCosts = await dead(w1, true);
    expect(byId(withCosts.rows).get(p.neverSold!)?.value).toBe(6000);
    expect(withCosts.summary.value).toBeGreaterThan(0);
    const without = await dead(w1, false);
    expect(without.rows.every((row) => row.value === null)).toBe(true);
    expect(without.summary.value).toBeNull();
  });

  it('cada bodega por separado: lo trasladado recién llegó a la de destino', async () => {
    expect((await dead(w2)).rows).toEqual([]);
  });

  it('nunca mezcla empresas', async () => {
    expect((await dead(wB)).rows).toEqual([]);
    const other = await dead(wB, false, companyB);
    expect(other.rows.map((row) => row.productId)).toEqual([p.other]);
  });

  it('avisa por la campanita solo lo que hoy cumple un hito, y nada con los avisos apagados', async () => {
    const count = await alertDeadStock(companyA, NOW);
    // 30 días justos (el umbral) y 120 (el cuádruple). Los de 40, 50 y 100 no son hitos hoy.
    expect(count).toBe(2);
    const notes = await prisma.workflowNotification.findMany({ where: { companyId: companyA } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ severity: 'WARNING', title: '2 productos sin venderse', href: `/dashboard/retail/stock-muerto?bodega=${w1}` });
    expect(notes[0]!.message).toContain('Producto milestone');
    expect(notes[0]!.message).toContain('Producto longStopped');

    await saveDeadStockSettings(companyA, { deadStockDays: 30, deadStockAlerts: false });
    expect(await alertDeadStock(companyA, NOW)).toBe(0);
    expect(await prisma.workflowNotification.count({ where: { companyId: companyA } })).toBe(1);
    expect(await prisma.workflowNotification.count({ where: { companyId: companyB } })).toBe(0);
  });
});

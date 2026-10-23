/**
 * Registro de movimientos por bodega contra una base PostgreSQL REAL (mismas reglas de seguridad que
 * `tests/warehouse-mobile-db.test.ts`: solo corre contra una base local cuyo nombre termina en `_test`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/movement-log-db.test.ts
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

describeDb('registro de movimientos por bodega contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let log: typeof import('@/modules/inventory/services/movement-log.service');
  let stock: typeof import('@/modules/inventory/services/stock.service');

  const suffix = Math.random().toString(36).slice(2, 8);
  const ids = { a: '', b: '', whCentral: '', whSucursal: '', whB: '', u1: '', u2: '', s1: '', p1: '', p2: '', pB: '' };
  const photo = (name: string) => `https://abc123.public.blob.vercel-storage.com/inventory-evidence/${ids.a}/bodega-${name}-${suffix}.jpg`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    log = await import('@/modules/inventory/services/movement-log.service');
    stock = await import('@/modules/inventory/services/stock.service');

    ids.a = (await prisma.company.create({ data: { rut: `75${suffix}1-1`, businessName: `Registro A ${suffix}` } })).id;
    ids.b = (await prisma.company.create({ data: { rut: `75${suffix}2-2`, businessName: `Registro B ${suffix}` } })).id;
    ids.whCentral = (await prisma.warehouse.create({ data: { companyId: ids.a, name: 'Central', code: 'CEN', isDefault: true } })).id;
    ids.whSucursal = (await prisma.warehouse.create({ data: { companyId: ids.a, name: 'Sucursal', code: 'SUC' } })).id;
    ids.whB = (await prisma.warehouse.create({ data: { companyId: ids.b, name: 'Bodega B', code: 'BB' } })).id;
    const user = (n: number, name: string) => prisma.user.create({ data: { email: `reg${n}-${suffix}@test.cl`, passwordHash: 'x', name, companyId: ids.a, role: 'WAREHOUSE' } });
    ids.u1 = (await user(1, 'Ana Operaria')).id;
    ids.u2 = (await user(2, 'Beto Operario')).id;
    ids.s1 = (await prisma.contact.create({ data: { companyId: ids.a, razonSocial: 'Proveedor Registro SpA', rut: '79.111.111-1', rutClean: '791111111', isSupplier: true } })).id;
    ids.p1 = (await prisma.product.create({ data: { companyId: ids.a, sku: 'R1', name: 'Aceite Registro', brand: 'Chef', netPrice: 100, grossPrice: 119, costPricePMP: 500 } })).id;
    ids.p2 = (await prisma.product.create({ data: { companyId: ids.a, sku: 'R2', name: 'Harina Registro', netPrice: 100, grossPrice: 119, costPricePMP: 300 } })).id;
    ids.pB = (await prisma.product.create({ data: { companyId: ids.b, sku: 'R1', name: 'Producto de B', netPrice: 100, grossPrice: 119 } })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [ids.a, ids.b].filter(Boolean)) {
      await prisma.journalEntry?.deleteMany?.({ where: { companyId } }).catch(() => undefined);
      await prisma.inventoryLot.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  const arrive = (warehouseId: string, productId: string, quantity: number, userId?: string, supplierId?: string) =>
    stock.registerStockIn(ids.a, { productId, warehouseId, type: 'PURCHASE_IN', quantity, unitCost: 500, userId, supplierId });
  const out = (warehouseId: string, productId: string, quantity: number, reasonCode: string, userId: string, evidenceUrl?: string) =>
    stock.registerStockOut(ids.a, { productId, warehouseId, type: 'ADJUSTMENT_OUT', quantity, userId, reasonCode, evidenceUrl, notes: `nota ${reasonCode}` });

  beforeAll(async () => {
    await arrive(ids.whCentral, ids.p1, 100, ids.u1, ids.s1);
    await arrive(ids.whSucursal, ids.p1, 40, ids.u2);
    await arrive(ids.whCentral, ids.p2, 50, ids.u2);
    await out(ids.whCentral, ids.p1, 5, 'EXPIRED', ids.u1, photo('vencido'));
    await out(ids.whCentral, ids.p1, 3, 'TASTING', ids.u2, photo('degustacion'));
    await out(ids.whCentral, ids.p2, 2, 'DAMAGED', ids.u1, photo('dano'));
    await out(ids.whSucursal, ids.p1, 7, 'DAMAGED', ids.u2, photo('sucursal'));
    await stock.registerTransfer(ids.a, { productId: ids.p1, fromWarehouseId: ids.whCentral, toWarehouseId: ids.whSucursal, quantity: 10, userId: ids.u1 });
  });

  it('cada bodega muestra SOLO sus movimientos: las bodegas no se mezclan', async () => {
    const central = await log.listMovementLog(ids.a, { warehouseId: ids.whCentral });
    const sucursal = await log.listMovementLog(ids.a, { warehouseId: ids.whSucursal });
    expect(central.rows.every((row) => row.sku === 'R1' || row.sku === 'R2')).toBe(true);
    // Central: 2 llegadas (p1, p2) + 3 salidas + 1 traslado (salida) = 6. Sucursal: 1 llegada + 1 salida + 1 traslado (entrada) = 3.
    expect(central.rows).toHaveLength(6);
    expect(sucursal.rows).toHaveLength(3);
    const centralIds = new Set(central.rows.map((row) => row.id));
    expect(sucursal.rows.some((row) => centralIds.has(row.id))).toBe(false);
  });

  it('el traslado aparece en cada bodega con su sentido: sale de una y entra a la otra', async () => {
    const central = (await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, kind: 'TRANSFERS' })).rows;
    const sucursal = (await log.listMovementLog(ids.a, { warehouseId: ids.whSucursal, kind: 'TRANSFERS' })).rows;
    expect(central).toHaveLength(1);
    expect(sucursal).toHaveLength(1);
    expect(central[0]).toMatchObject({ direction: 'out', quantity: 10, operator: 'Ana Operaria' });
    expect(sucursal[0]).toMatchObject({ direction: 'in', quantity: 10, operator: 'Ana Operaria' });
  });

  it('cada fila dice quién la hizo, el motivo, la foto, el proveedor y el stock resultante', async () => {
    const rows = (await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, kind: 'OUTFLOWS' })).rows;
    const tasting = rows.find((row) => row.reasonCode === 'TASTING')!;
    expect(tasting).toMatchObject({ operator: 'Beto Operario', reasonLabel: 'Degustación o muestra', evidenceUrl: photo('degustacion'), productName: 'Aceite Registro', direction: 'out', quantity: 3 });
    expect(tasting.note).toContain('nota TASTING');
    const arrival = (await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, kind: 'ARRIVALS' })).rows.find((row) => row.sku === 'R1')!;
    expect(arrival).toMatchObject({ supplier: 'Proveedor Registro SpA', operator: 'Ana Operaria', direction: 'in', stockAfter: 100 });
  });

  it('filtra por tipo, motivo, operario, proveedor y producto', async () => {
    const reasons = async (filter: Partial<import('@/modules/inventory/services/movement-log.service').MovementLogFilter>) =>
      (await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, ...filter })).rows.map((row) => row.reasonCode).filter(Boolean).sort();
    expect(await reasons({ reason: 'EXPIRED' })).toEqual(['EXPIRED']);
    expect(await reasons({ kind: 'OUTFLOWS' })).toEqual(['DAMAGED', 'EXPIRED', 'TASTING']);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, userId: ids.u2 })).rows.map((row) => row.operator)).toEqual(expect.arrayContaining(['Beto Operario']));
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, userId: ids.u2 })).rows.every((row) => row.operator === 'Beto Operario')).toBe(true);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, supplierId: ids.s1 })).rows).toHaveLength(1);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, q: 'harina' })).rows.every((row) => row.sku === 'R2')).toBe(true);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, q: 'r2' })).rows).toHaveLength(2);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, reason: 'NONE', kind: 'ARRIVALS' })).rows).toHaveLength(2);
  });

  it('filtra por fechas en hora de Chile, ambas inclusivas', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const all = (await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, from: today, to: today })).rows;
    expect(all).toHaveLength(6);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, from: '2000-01-01', to: '2000-01-31' })).rows).toHaveLength(0);
    // Una fecha mal escrita no filtra (en vez de fallar).
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, from: 'ayer' })).rows).toHaveLength(6);
    // Un movimiento antiguo queda fuera de "hoy".
    await prisma.inventoryMovement.updateMany({ where: { companyId: ids.a, warehouseId: ids.whCentral, reasonCode: 'TASTING' }, data: { createdAt: new Date('2020-05-05T15:00:00Z') } });
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, from: today, to: today })).rows).toHaveLength(5);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, from: '2020-05-05', to: '2020-05-05' })).rows).toHaveLength(1);
    expect((await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, from: '2020-05-06' })).rows).toHaveLength(5);
  });

  it('pagina de a pocos sin repetir ni saltarse movimientos', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page = await log.listMovementLog(ids.a, { warehouseId: ids.whCentral, take: 3, cursor });
      expect(page.rows.length).toBeLessThanOrEqual(3);
      seen.push(...page.rows.map((row) => row.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
    const dates = (await log.listMovementLog(ids.a, { warehouseId: ids.whCentral })).rows.map((row) => row.createdAt.getTime());
    expect(dates).toEqual([...dates].sort((x, y) => y - x));
  });

  it('resume las salidas de la bodega por motivo (y no suma las de la otra bodega)', async () => {
    const central = await log.summarizeOutflows(ids.a, { warehouseId: ids.whCentral }, { includeCosts: true });
    expect(central.map((row) => [row.reasonCode, row.units]).sort()).toEqual([['DAMAGED', 2], ['EXPIRED', 5], ['TASTING', 3]]);
    const damaged = central.find((row) => row.reasonCode === 'DAMAGED')!;
    expect(damaged).toMatchObject({ movements: 1, reasonLabel: 'Mal estado o dañado' });
    // 2 unidades al costo promedio vigente (500, el de la última llegada del producto).
    expect(damaged.totalCost).toBe(2 * 500);
    const sucursal = await log.summarizeOutflows(ids.a, { warehouseId: ids.whSucursal });
    expect(sucursal).toHaveLength(1);
    expect(sucursal[0]).toMatchObject({ reasonCode: 'DAMAGED', units: 7, totalCost: null });
  });

  it('los costos solo se entregan a quien puede verlos', async () => {
    const hidden = await log.listMovementLog(ids.a, { warehouseId: ids.whCentral });
    expect(hidden.rows.every((row) => row.totalCost === null)).toBe(true);
    const shown = await log.listMovementLog(ids.a, { warehouseId: ids.whCentral }, { includeCosts: true });
    expect(shown.rows.some((row) => (row.totalCost ?? 0) > 0)).toBe(true);
  });

  it('los filtros del registro ofrecen solo operarios y proveedores de esa bodega', async () => {
    const central = await log.movementLogFacets(ids.a, ids.whCentral);
    expect(central.operators.map((row) => row.name).sort()).toEqual(['Ana Operaria', 'Beto Operario']);
    expect(central.suppliers.map((row) => row.name)).toEqual(['Proveedor Registro SpA']);
    const sucursal = await log.movementLogFacets(ids.a, ids.whSucursal);
    expect(sucursal.suppliers).toEqual([]);
  });

  it('otra empresa no ve nada de esta bodega, ni siquiera con su id', async () => {
    expect((await log.listMovementLog(ids.b, { warehouseId: ids.whCentral })).rows).toEqual([]);
    expect(await log.summarizeOutflows(ids.b, { warehouseId: ids.whCentral })).toEqual([]);
    expect(await log.getWarehouseOf(ids.b, ids.whCentral)).toBeNull();
    expect(await log.getWarehouseOf(ids.a, ids.whCentral)).toMatchObject({ name: 'Central' });
    const facets = await log.movementLogFacets(ids.b, ids.whCentral);
    expect(facets).toEqual({ operators: [], suppliers: [] });
  });

  it('el kardex de un producto también dice bodega, operario, motivo y foto, y se puede acotar a una bodega', async () => {
    const all = await stock.listMovements(ids.a, ids.p1);
    expect(new Set(all.map((row) => row.warehouseName))).toEqual(new Set(['Central', 'Sucursal']));
    const central = await stock.listMovements(ids.a, ids.p1, { warehouseId: ids.whCentral });
    expect(central.every((row) => row.warehouseName === 'Central')).toBe(true);
    const expired = central.find((row) => row.reasonCode === 'EXPIRED')!;
    expect(expired).toMatchObject({ operator: 'Ana Operaria', reasonLabel: 'Vencido', evidenceUrl: photo('vencido') });
  });

  it('un movimiento con un proveedor de otra empresa no se registra', async () => {
    const foreign = await prisma.contact.create({ data: { companyId: ids.b, razonSocial: 'Ajeno', rut: '79.222.222-2', rutClean: '792222222', isSupplier: true } });
    await expect(stock.registerStockIn(ids.a, { productId: ids.p1, warehouseId: ids.whCentral, type: 'PURCHASE_IN', quantity: 1, unitCost: 1, supplierId: foreign.id })).rejects.toThrow('Proveedor no encontrado');
  });
});

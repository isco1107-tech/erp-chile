/**
 * Mermas con responsable contra una base PostgreSQL REAL: qué salida cuenta
 * como pérdida, las sugerencias, la asignación (solo dentro de la empresa) y
 * el aviso de lotes por vencer.
 *
 *   RETAIL_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/inventory-shrinkage-db.test.ts
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

describeDb('Mermas con responsable contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let stock: typeof import('@/modules/inventory/services/stock.service');
  let shrinkage: typeof import('@/modules/inventory/services/shrinkage.service');

  const suffix = Math.random().toString(36).slice(2, 8);
  const ids: Record<string, string> = {};
  const m: Record<string, string> = {};
  const actor = { id: 'u-actor', name: 'Ana Encargada' };
  const today = new Date();
  const key = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
  const period = () => ({ warehouseId: ids.w1!, from: key(new Date(today.getTime() - 5 * 86_400_000)), to: key(today) });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    stock = await import('@/modules/inventory/services/stock.service');
    shrinkage = await import('@/modules/inventory/services/shrinkage.service');

    ids.a = (await prisma.company.create({ data: { rut: `81${suffix}1-1`, businessName: `Mermas A ${suffix}` } })).id;
    ids.b = (await prisma.company.create({ data: { rut: `81${suffix}2-2`, businessName: `Mermas B ${suffix}` } })).id;
    ids.w1 = (await prisma.warehouse.create({ data: { companyId: ids.a, name: 'Sala', code: 'SALA', isDefault: true } })).id;
    ids.w2 = (await prisma.warehouse.create({ data: { companyId: ids.a, name: 'Trastienda', code: 'TRAS' } })).id;
    ids.wb = (await prisma.warehouse.create({ data: { companyId: ids.b, name: 'Otra', code: 'OTRA', isDefault: true } })).id;
    ids.user = (await prisma.user.create({ data: { email: `merma-${suffix}@test.cl`, passwordHash: 'x', name: 'Beto Bodega', companyId: ids.a, role: 'WAREHOUSE' } })).id;
    const supplier = (companyId: string, name: string, n: number, isSupplier = true) =>
      prisma.contact.create({ data: { companyId, razonSocial: name, rut: `76.${n}00.000-${n}`, rutClean: `76${n}00000${n}`, isSupplier } }).then((c) => c.id);
    ids.miel = await supplier(ids.a, 'Miel del Sur', 1);
    ids.quesos = await supplier(ids.a, 'Quesos Llanquihue', 2);
    ids.cliente = await supplier(ids.a, 'Cliente', 3, false);
    ids.ajeno = await supplier(ids.b, 'Proveedor ajeno', 4);

    const product = async (name: string, suppliers: string[]) => {
      const id = (await prisma.product.create({ data: { companyId: ids.a, sku: `${name}-${suffix}`, name, netPrice: 1000, grossPrice: 1190 } })).id;
      for (const supplierId of suppliers) await prisma.productSupplier.create({ data: { companyId: ids.a, productId: id, supplierId } });
      await stock.registerStockIn(ids.a, { productId: id, warehouseId: ids.w1!, type: 'PURCHASE_IN', quantity: 100, unitCost: 500 });
      await stock.registerStockIn(ids.a, { productId: id, warehouseId: ids.w2!, type: 'PURCHASE_IN', quantity: 100, unitCost: 500 });
      return id;
    };
    ids.pMiel = await product('Miel', [ids.miel]);
    ids.pMixto = await product('Canasta', [ids.miel, ids.quesos]);

    const out = async (name: string, productId: string, extra: Record<string, unknown>, warehouseId = ids.w1!) =>
      (m[name] = (await stock.registerStockOut(ids.a, { productId, warehouseId, type: 'ADJUSTMENT_OUT', quantity: 2, ...extra })).id);
    await out('vencido', ids.pMiel, { reasonCode: 'EXPIRED', userId: ids.user });
    await out('roto', ids.pMixto, { reasonCode: 'DAMAGED', userId: ids.user });
    await out('mixtoVencido', ids.pMixto, { reasonCode: 'EXPIRED', userId: ids.user });
    await out('ajusteManual', ids.pMiel, { userId: ids.user, notes: 'Se cayó' });
    await out('faltante', ids.pMiel, { reference: 'Toma de inventario #7' });
    // No son pérdidas: devolución al proveedor, consumo de producción, anulación de una venta y otra bodega.
    await out('devolucion', ids.pMiel, { reasonCode: 'SUPPLIER_RETURN', userId: ids.user });
    await out('produccion', ids.pMiel, { reference: 'OP #3', notes: 'Consumo de producción' });
    await out('anulacion', ids.pMiel, { reference: 'Anulación DTE 39 N° 12' });
    await out('otraBodega', ids.pMiel, { reasonCode: 'EXPIRED', userId: ids.user }, ids.w2!);
    m.venta = (await stock.registerStockOut(ids.a, { productId: ids.pMiel, warehouseId: ids.w1!, type: 'SALE_OUT', quantity: 1 })).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [ids.a, ids.b].filter(Boolean) as string[]) {
      await prisma.workflowNotification.deleteMany({ where: { companyId } });
      await prisma.shrinkageLiability.deleteMany({ where: { companyId } });
      await prisma.shrinkageSettings.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.inventoryLot.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.productSupplier.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  const list = (filter: Partial<import('@/modules/inventory/services/shrinkage.service').ShrinkageFilter> = {}, includeCosts = true) =>
    shrinkage.listShrinkage(ids.a!, { ...period(), ...filter }, { includeCosts });

  it('solo las pérdidas de la bodega: con motivo, ajustes de una persona y faltantes de conteo', async () => {
    const { rows, summary } = await list();
    expect(rows.map((row) => row.id).sort()).toEqual([m.vencido, m.roto, m.mixtoVencido, m.ajusteManual, m.faltante].sort());
    expect(rows.find((row) => row.id === m.faltante)).toMatchObject({ reasonCode: 'NONE', reasonLabel: 'Faltante en toma de inventario', operator: null });
    expect(rows.find((row) => row.id === m.ajusteManual)).toMatchObject({ reasonCode: 'NONE', reasonLabel: 'Ajuste de salida sin motivo', operator: 'Beto Bodega' });
    expect(summary).toMatchObject({ movements: 5, units: 10, cost: 5000 });
    expect(summary.byState.UNASSIGNED.movements).toBe(5);
    // Sin permiso de costos no viaja ningún monto.
    const blind = await list({}, false);
    expect(blind.rows.every((row) => row.totalCost === null)).toBe(true);
    expect(blind.summary.cost).toBeNull();
  });

  it('las sugerencias salen de los acuerdos guardados y se confirman sin pisar lo asignado a mano', async () => {
    expect((await list()).rows.every((row) => row.suggestion === null)).toBe(true);
    await shrinkage.saveShrinkageSettings(ids.a!, { defaults: { EXPIRED: 'SUPPLIER', DAMAGED: 'STORE' }, expiryAlerts: true, expiryAlertDays: 7 });
    const rows = (await list()).rows;
    expect(rows.find((row) => row.id === m.vencido)!.suggestion).toEqual({ party: 'SUPPLIER', supplier: { id: ids.miel, name: 'Miel del Sur' } });
    expect(rows.find((row) => row.id === m.roto)!.suggestion).toEqual({ party: 'STORE', supplier: null });
    // Dos proveedores y sin llegada: no se adivina.
    expect(rows.find((row) => row.id === m.mixtoVencido)!.suggestion).toBeNull();

    await shrinkage.assignLiability(ids.a!, actor, { movementId: m.roto!, party: 'SUPPLIER', supplierId: ids.quesos });
    expect(await shrinkage.applySuggestions(ids.a!, actor, period())).toBe(1);
    const after = (await list()).rows;
    expect(after.find((row) => row.id === m.vencido)).toMatchObject({ state: 'SUPPLIER', liability: { supplier: { id: ids.miel }, assignedByName: 'Ana Encargada' } });
    expect(after.find((row) => row.id === m.roto)).toMatchObject({ state: 'SUPPLIER', liability: { supplier: { id: ids.quesos } } });
    expect(after.find((row) => row.id === m.mixtoVencido)!.state).toBe('UNASSIGNED');
  });

  it('filtra y resume por proveedor; quitar el responsable la deja sin asignar', async () => {
    const { summary } = await list();
    expect(summary.bySupplier.map((entry) => entry.name).sort()).toEqual(['Miel del Sur', 'Quesos Llanquihue']);
    expect((await list({ supplierId: ids.quesos })).rows.map((row) => row.id)).toEqual([m.roto]);
    expect((await list({ state: 'UNASSIGNED', reason: 'NONE' })).rows.map((row) => row.id).sort()).toEqual([m.ajusteManual, m.faltante].sort());
    await shrinkage.assignLiability(ids.a!, actor, { movementId: m.roto!, party: null });
    expect((await list({ supplierId: ids.quesos })).rows).toEqual([]);
  });

  it('nada fuera de la empresa: ni la pérdida, ni un proveedor ajeno, ni un contacto que no es proveedor', async () => {
    await expect(shrinkage.assignLiability(ids.b!, actor, { movementId: m.vencido!, party: 'STORE' })).rejects.toThrow('no existe en tu empresa');
    await expect(shrinkage.assignLiability(ids.a!, actor, { movementId: m.devolucion!, party: 'STORE' })).rejects.toThrow('no existe en tu empresa');
    await expect(shrinkage.assignLiability(ids.a!, actor, { movementId: m.venta!, party: 'STORE' })).rejects.toThrow('no existe en tu empresa');
    await expect(shrinkage.assignLiability(ids.a!, actor, { movementId: m.mixtoVencido!, party: 'SUPPLIER', supplierId: ids.ajeno })).rejects.toThrow('proveedor o seller de tu empresa');
    await expect(shrinkage.assignLiability(ids.a!, actor, { movementId: m.mixtoVencido!, party: 'SUPPLIER', supplierId: ids.cliente })).rejects.toThrow('proveedor o seller de tu empresa');
    expect((await shrinkage.listShrinkage(ids.b!, { ...period(), warehouseId: ids.w1! }, { includeCosts: true })).rows).toEqual([]);
    expect((await shrinkage.listSuppliersForShrinkage(ids.a!)).map((entry) => entry.name)).toEqual(expect.arrayContaining(['Miel del Sur', 'Quesos Llanquihue']));
    expect((await shrinkage.listSuppliersForShrinkage(ids.a!)).map((entry) => entry.name)).not.toContain('Cliente');
  });

  it('la mercadería de un seller: se sugiere al seller dueño y se le puede asignar aunque no sea proveedor', async () => {
    const seller = (await prisma.contact.create({ data: { companyId: ids.a!, razonSocial: 'Artesana Seller', rut: '76.700.000-7', rutClean: '767000007', isConsignor: true, consignmentCommissionBps: 2000 } })).id;
    const consigned = (await prisma.product.create({ data: { companyId: ids.a!, sku: `Seller-${suffix}`, name: 'Cerámica', netPrice: 1000, grossPrice: 1190, consignorId: seller } })).id;
    // También lo surte un proveedor: igual responde la dueña de la mercadería.
    await prisma.productSupplier.create({ data: { companyId: ids.a!, productId: consigned, supplierId: ids.quesos! } });
    const lost = await prisma.inventoryMovement.create({
      data: { companyId: ids.a!, productId: consigned, warehouseId: ids.w2!, type: 'ADJUSTMENT_OUT', quantity: 1, unitCost: 0, totalCost: 0, previousStock: 5, newStock: 4, previousPmp: 0, newPmp: 0, reasonCode: 'EXPIRED', userId: ids.user },
    });
    await shrinkage.saveShrinkageSettings(ids.a!, { defaults: { EXPIRED: 'SUPPLIER' }, expiryAlerts: true, expiryAlertDays: 7 });
    const row = (await list({ warehouseId: ids.w2! })).rows.find((entry) => entry.id === lost.id)!;
    expect(row.suggestion).toEqual({ party: 'SUPPLIER', supplier: { id: seller, name: 'Artesana Seller' } });
    expect(row.productSuppliers.map((entry) => entry.id)).toEqual([seller, ids.quesos]);
    await shrinkage.assignLiability(ids.a!, actor, { movementId: lost.id, party: 'SUPPLIER', supplierId: seller });
    expect((await list({ warehouseId: ids.w2!, supplierId: seller })).rows.map((entry) => entry.id)).toEqual([lost.id]);
    expect((await shrinkage.listSuppliersForShrinkage(ids.a!)).map((entry) => entry.name)).toContain('Artesana Seller');
  });

  it('avisa por la campanita los lotes a los días configurados y los que vencen hoy', async () => {
    const lot = (lotNumber: string, days: number) => {
      const date = new Date(today.getTime() + days * 86_400_000);
      const [y, mo, d] = key(date).split('-').map(Number) as [number, number, number];
      return prisma.inventoryLot.create({ data: { companyId: ids.a!, productId: ids.pMiel!, warehouseId: ids.w1!, lotNumber, quantity: 3, expiryDate: new Date(Date.UTC(y, mo - 1, d, 12)) } });
    };
    await lot(`L7-${suffix}`, 7);
    await lot(`L0-${suffix}`, 0);
    await lot(`L5-${suffix}`, 5);
    expect(await shrinkage.alertExpiringLots(ids.a!, today)).toBe(2);
    const notes = await prisma.workflowNotification.findMany({ where: { companyId: ids.a! } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ severity: 'CRITICAL', title: 'Un lote vence hoy y 1 en 7 días', href: '/dashboard/inventory/lots' });

    await shrinkage.saveShrinkageSettings(ids.a!, { defaults: {}, expiryAlerts: false, expiryAlertDays: 7 });
    expect(await shrinkage.alertExpiringLots(ids.a!, today)).toBe(0);
    expect(await shrinkage.alertExpiringLots(ids.b!, today)).toBe(0);
  });
});

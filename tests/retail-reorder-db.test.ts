/**
 * Reposición predictiva contra una base PostgreSQL REAL: el ritmo sale del
 * kardex, el tiempo de entrega de los ajustes o de las órdenes de compra
 * recibidas, y lo pendiente de las órdenes enviadas.
 *
 *   RETAIL_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/retail-reorder-db.test.ts
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

describeDb('Reposición predictiva contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let stock: typeof import('@/modules/inventory/services/stock.service');
  let getReorderPlan: typeof import('@/modules/retail/services/reorder.service').getReorderPlan;
  let saveReorderSettings: typeof import('@/modules/retail/services/retail-settings.service').saveReorderSettings;

  const DAY = 86_400_000;
  const NOW = new Date();
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
  const suffix = Math.random().toString(36).slice(2, 8);
  let companyA = '';
  let companyB = '';
  let w1 = '';
  let w2 = '';
  const s: Record<string, string> = {};
  const p: Record<string, string> = {};
  let folio = 1;

  const backdate = (id: string, when: Date) => prisma.inventoryMovement.update({ where: { id }, data: { createdAt: when } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    stock = await import('@/modules/inventory/services/stock.service');
    ({ getReorderPlan } = await import('@/modules/retail/services/reorder.service'));
    ({ saveReorderSettings } = await import('@/modules/retail/services/retail-settings.service'));

    companyA = (await prisma.company.create({ data: { rut: `80${suffix}1-1`, businessName: `Reposición A ${suffix}` } })).id;
    companyB = (await prisma.company.create({ data: { rut: `80${suffix}2-2`, businessName: `Reposición B ${suffix}` } })).id;
    w1 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Principal', code: 'PRIN', isDefault: true } })).id;
    w2 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Sucursal', code: 'SUC' } })).id;
    const supplier = (companyId: string, key: string, n: number) =>
      prisma.contact.create({ data: { companyId, razonSocial: `Proveedor ${key}`, rut: `77.${n}00.000-${n}`, rutClean: `77${n}00000${n}`, isSupplier: true } }).then((c) => (s[key] = c.id));
    await supplier(companyA, 'configurado', 1);
    await supplier(companyA, 'medido', 2);
    await supplier(companyA, 'sinDatos', 3);
    await supplier(companyB, 'ajeno', 4);

    for (const [key, supplierKey] of [['p1', 'configurado'], ['p2', 'medido'], ['p3', 'sinDatos']] as const) {
      p[key] = (await prisma.product.create({ data: { companyId: companyA, sku: `${key}-${suffix}`, name: `Producto ${key}`, netPrice: 1000, grossPrice: 1190 } })).id;
      await prisma.productSupplier.create({ data: { companyId: companyA, productId: p[key]!, supplierId: s[supplierKey]! } });
      // 200 unidades y 5 por día los últimos 28 días (todos con venta): quedan 60, ritmo 5, sin patrón.
      await backdate((await stock.registerStockIn(companyA, { productId: p[key]!, warehouseId: w1, type: 'PURCHASE_IN', quantity: 200, unitCost: 500 })).id, new Date(ago(28).getTime() - 60_000));
      for (let d = 28; d >= 1; d -= 1) {
        await backdate((await stock.registerStockOut(companyA, { productId: p[key]!, warehouseId: w1, type: 'SALE_OUT', quantity: 5 })).id, ago(d));
      }
    }

    // Lo pendiente de una orden enviada (20 pedidas, 5 recibidas).
    const order = await prisma.purchaseOrder.create({
      data: { companyId: companyA, contactId: s.configurado!, folio: folio++, status: 'PARTIALLY_RECEIVED', items: { create: { companyId: companyA, productId: p.p1!, description: 'p1', quantity: 20, unitCost: 500, receivedQuantity: 5 } } },
    });
    // Una orden en borrador no cuenta como en camino.
    await prisma.purchaseOrder.create({ data: { companyId: companyA, contactId: s.configurado!, folio: folio++, status: 'DRAFT', items: { create: { companyId: companyA, productId: p.p1!, description: 'p1', quantity: 999, unitCost: 500 } } } });
    // Tiempo medido del segundo proveedor: dos recepciones a 4 y 6 días de su orden.
    for (const days of [4, 6]) {
      const measured = await prisma.purchaseOrder.create({ data: { companyId: companyA, contactId: s.medido!, folio: folio++, status: 'RECEIVED', issueDate: ago(30 + days) } });
      await prisma.goodsReceipt.create({ data: { companyId: companyA, orderId: measured.id, warehouseId: w1, folio: folio++, receivedAt: ago(30) } });
    }
    expect(order.id).toBeTruthy();

    // El tiempo del proveedor de otra empresa se descarta al guardar.
    await saveReorderSettings(companyA, { reorderLeadDays: 7, reorderCoverDays: 14, supplierLeadDays: { [s.configurado!]: 3, [s.ajeno!]: 1 } });
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [companyA, companyB].filter(Boolean)) {
      await prisma.retailSettings.deleteMany({ where: { companyId } });
      await prisma.goodsReceipt.deleteMany({ where: { companyId } });
      await prisma.purchaseOrderItem.deleteMany({ where: { companyId } });
      await prisma.purchaseOrder.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.productSupplier.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  const rowOf = async (productId: string, warehouseId = w1, isDefaultWarehouse = true) =>
    (await getReorderPlan(companyA, { warehouseId, isDefaultWarehouse }, NOW)).rows.find((row) => row.productId === productId);

  it('el tiempo de entrega: configurado, medido en sus órdenes o por defecto', async () => {
    expect(await rowOf(p.p1!)).toMatchObject({ leadDays: 3, leadSource: 'CONFIGURED', supplier: { id: s.configurado } });
    expect(await rowOf(p.p2!)).toMatchObject({ leadDays: 5, leadSource: 'MEASURED' });
    expect(await rowOf(p.p3!)).toMatchObject({ leadDays: 7, leadSource: 'DEFAULT' });
    const settings = await prisma.retailSettings.findUnique({ where: { companyId: companyA } });
    expect(settings?.supplierLeadDays).toEqual({ [s.configurado!]: 3 });
  });

  it('ritmo del kardex y lo que viene en camino solo en la bodega principal (sin borradores)', async () => {
    const p1 = await rowOf(p.p1!);
    expect(p1).toMatchObject({ stock: 60, incoming: 15, dailyRate: 5 });
    // 60 + 15 = 75 alcanzan 15 días; con 3 de entrega, pedir dentro de 12; cubre 3 + 14 días = 85, faltan 10.
    expect(p1).toMatchObject({ daysToStockout: 15, suggestedQty: 10, status: 'OK' });
    const p3 = await rowOf(p.p3!);
    expect(p3).toMatchObject({ incoming: 0, daysToStockout: 12, suggestedQty: 45, status: 'SOON' });
  });

  it('otra bodega no descuenta lo que viene en camino; otra empresa no ve nada', async () => {
    expect(await rowOf(p.p1!, w2, false)).toBeUndefined();
    expect((await getReorderPlan(companyB, { warehouseId: w1, isDefaultWarehouse: true }, NOW)).rows).toEqual([]);
  });
});

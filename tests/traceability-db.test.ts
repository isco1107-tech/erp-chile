/**
 * Trazabilidad contra PostgreSQL real: el recorrido completo de un producto con lotes y series
 * (recepción → venta con series → anulación), la genealogía de un lote hacia atrás y hacia adelante,
 * la producción como eslabón, el aislamiento entre empresas y el traslado de series. Solo se
 * habilita sobre una base LOCAL desechable terminada en `_test`; nunca usa la DATABASE_URL del .env.
 *
 * WAREHOUSE_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/erp_pos_test \
 *   npx jest tests/traceability-db.test.ts --runInBand
 */
import type { PrismaClient } from '@prisma/client';

const TEST_URL = process.env.WAREHOUSE_TEST_DATABASE_URL;
const safeDatabase = (url: string | undefined): url is string => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname) && /_test$/.test(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
};
const describeDb = safeDatabase(TEST_URL) ? describe : describe.skip;

jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn(async () => undefined) }));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn(async () => undefined) }));
jest.mock('@/lib/supersuite', () => ({ latidoCajaSupersuite: jest.fn() }));

jest.setTimeout(120_000);

describeDb('Trazabilidad contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let receipts: typeof import('@/modules/purchases/services/goods-receipt.service');
  let sales: typeof import('@/modules/sales/services/sales.service');
  let pos: typeof import('@/modules/pos/services/pos.service');
  let trace: typeof import('@/modules/inventory/services/traceability.service');
  let genealogy: typeof import('@/modules/inventory/services/genealogy.service');
  let overview: typeof import('@/modules/inventory/services/traceability-overview.service');
  let manufacturing: typeof import('@/modules/manufacturing/services/manufacturing.service');
  let reset: typeof import('@/lib/company-erasure/core');
  const companyIds: string[] = [];
  const run = Math.random().toString(36).slice(2, 10);
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    receipts = await import('@/modules/purchases/services/goods-receipt.service');
    sales = await import('@/modules/sales/services/sales.service');
    pos = await import('@/modules/pos/services/pos.service');
    trace = await import('@/modules/inventory/services/traceability.service');
    genealogy = await import('@/modules/inventory/services/genealogy.service');
    overview = await import('@/modules/inventory/services/traceability-overview.service');
    manufacturing = await import('@/modules/manufacturing/services/manufacturing.service');
    reset = await import('@/lib/company-erasure/core');
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      const facts = await reset.loadSchemaFacts(prisma);
      const plan = reset.buildResetPlan({ tenantTables: facts.tenantTables, foreignKeys: facts.foreignKeys });
      for (const companyId of companyIds) {
        await prisma.$transaction((tx) => reset.runReset(tx, { companyId, plan, facts }), { timeout: 120_000 });
        await prisma.user.deleteMany({ where: { companyId } });
        await prisma.companyFeatures.deleteMany({ where: { companyId } });
        await prisma.companySettings.deleteMany({ where: { companyId } });
        await prisma.platformAuditLog.deleteMany({ where: { companyId } });
        await prisma.company.deleteMany({ where: { id: companyId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function fixture() {
    const key = `${run}-${++counter}`;
    const company = await prisma.company.create({
      data: { rut: `tr-${key}`, businessName: `Trazabilidad ${key}`, features: { create: { hasInventory: true, hasDteBilling: true, hasPurchases: true } }, settings: { create: { allowNegativeStock: false } } },
    });
    companyIds.push(company.id);
    const companyId = company.id;
    const user = await prisma.user.create({ data: { companyId, email: `tr-${key}@test.cl`, name: 'Bodeguero Beto', role: 'WAREHOUSE', passwordHash: 'x' } });
    const w1 = await prisma.warehouse.create({ data: { companyId, name: 'Central', code: 'C', isDefault: true } });
    const w2 = await prisma.warehouse.create({ data: { companyId, name: 'Sucursal', code: 'S' } });
    const supplier = await prisma.contact.create({ data: { companyId, rut: '76.111.111-1', rutClean: '761111111', razonSocial: 'Proveedor Andes', isSupplier: true } });
    const customerA = await prisma.contact.create({ data: { companyId, rut: '12.345.678-5', rutClean: '123456785', razonSocial: 'Ana Soto', isCustomer: true } });
    const customerB = await prisma.contact.create({ data: { companyId, rut: '9.999.999-3', rutClean: '99999993', razonSocial: 'Beto Rojas', isCustomer: true } });
    const product = await prisma.product.create({
      data: { companyId, sku: `TR-${key}`, name: 'Notebook 14', netPrice: 1000, grossPrice: 1190, isTrackable: true, tracksLots: true, tracksSerials: true, warrantyMonths: 12 },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        companyId,
        contactId: supplier.id,
        folio: 1,
        status: 'SENT',
        items: { create: [{ companyId, productId: product.id, description: 'Notebook 14', quantity: 5, unitCost: 400 }] },
      },
      include: { items: true },
    });
    return { companyId, user, w1, w2, supplier, customerA, customerB, product, order };
  }

  type Fx = Awaited<ReturnType<typeof fixture>>;

  const receive = (f: Fx, serialsText: string | undefined, quantity = 3, lotNumber = 'L-1') =>
    receipts.createGoodsReceipt(f.companyId, {
      orderId: f.order.id,
      warehouseId: f.w1.id,
      items: [{ orderItemId: f.order.items[0]!.id, quantity, lotNumber, expiryDate: '2027-12-31', serialsText }],
    });

  const sell = (f: Fx, contactId: string, serials: string[] | undefined, quantity = 1) =>
    sales.createSalesDocument(
      f.companyId,
      {
        contactId,
        warehouseId: f.w1.id,
        dteType: 'BOLETA_39',
        paymentMethod: 'EFECTIVO',
        items: [{ productId: f.product.id, description: 'Notebook 14', quantity, unitPrice: 1000, serials }],
      },
      'ISSUED'
    );

  it('una recepción de un producto con serie exige una serie por unidad', async () => {
    const f = await fixture();
    await expect(receive(f, 'N1\nN2')).rejects.toThrow(/Indica las 3 series/);
    await expect(receive(f, 'N1\nN1\nN2')).rejects.toThrow(/repetidas/);
    // Nada quedó a medias: ni stock, ni series, ni movimientos.
    expect(await prisma.productSerial.count({ where: { companyId: f.companyId } })).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { companyId: f.companyId } })).toBe(0);
  });

  it('recepción → venta con series → anulación: las series, la garantía y el enlace al documento', async () => {
    const f = await fixture();
    const receipt = await receive(f, 'n-001\nN-002, N-003');
    const serials = await prisma.productSerial.findMany({ where: { companyId: f.companyId }, orderBy: { serial: 'asc' } });
    expect(serials.map((s) => [s.serial, s.status, s.warehouseId, s.goodsReceiptId, s.supplierId, s.lotNumber])).toEqual([
      ['N-001', 'IN_STOCK', f.w1.id, receipt.id, f.supplier.id, 'L-1'],
      ['N-002', 'IN_STOCK', f.w1.id, receipt.id, f.supplier.id, 'L-1'],
      ['N-003', 'IN_STOCK', f.w1.id, receipt.id, f.supplier.id, 'L-1'],
    ]);
    const entry = await prisma.inventoryMovement.findFirstOrThrow({ where: { companyId: f.companyId, type: 'PURCHASE_IN' } });
    expect(entry).toMatchObject({ sourceKind: 'GOODS_RECEIPT', sourceId: receipt.id });

    const doc = await sell(f, f.customerA.id, ['N-002']);
    const sold = await prisma.productSerial.findFirstOrThrow({ where: { companyId: f.companyId, serial: 'N-002' } });
    expect(sold).toMatchObject({ status: 'SOLD', warehouseId: null, salesDocumentId: doc.id });
    expect(sold.warrantyUntil).not.toBeNull();
    const months = (sold.warrantyUntil!.getUTCFullYear() - sold.soldAt!.getUTCFullYear()) * 12 + sold.warrantyUntil!.getUTCMonth() - sold.soldAt!.getUTCMonth();
    expect(months).toBe(12);
    const out = await prisma.inventoryMovement.findFirstOrThrow({ where: { companyId: f.companyId, type: 'SALE_OUT' } });
    expect(out).toMatchObject({ sourceKind: 'SALES_DOCUMENT', sourceId: doc.id });

    // Una serie vendida no se puede volver a vender; una desconocida tampoco.
    await expect(sell(f, f.customerB.id, ['N-002'])).rejects.toThrow(/no está disponible/);
    await expect(sell(f, f.customerB.id, ['NO-EXISTE'])).rejects.toThrow(/no está registrada/);
    // Y el stock no se movió en esos intentos fallidos.
    expect((await prisma.stock.findFirstOrThrow({ where: { companyId: f.companyId, productId: f.product.id, warehouseId: f.w1.id } })).quantity).toBe(2);

    // La búsqueda de la serie cuenta toda la historia, con el cliente solo si se pide.
    const [journey] = await trace.lookupSerial(f.companyId, ' n-002 ', { includeCustomer: true });
    expect(journey).toMatchObject({ status: 'SOLD', supplier: 'Proveedor Andes' });
    expect(journey!.receipt).toContain('Recepción #1');
    expect(journey!.customer).toEqual({ name: 'Ana Soto', rut: '12.345.678-5' });
    expect(journey!.events.map((e) => e.title)).toEqual(['Vendida', 'Registrada en bodega']);
    expect((await trace.lookupSerial(f.companyId, 'N-002', { includeCustomer: false }))[0]!.customer).toBeNull();

    // Anular el documento devuelve la serie a la bodega, sin garantía.
    await sales.cancelSalesDocument(f.companyId, doc.id, 'Error de digitación');
    const back = await prisma.productSerial.findFirstOrThrow({ where: { companyId: f.companyId, serial: 'N-002' } });
    expect(back).toMatchObject({ status: 'IN_STOCK', warehouseId: f.w1.id, salesDocumentId: null, soldAt: null, warrantyUntil: null });
  });

  it('anular una recepción retira sus series; si una ya se vendió, no se puede anular', async () => {
    const f = await fixture();
    const receipt = await receive(f, 'A1,A2,A3');
    await sell(f, f.customerA.id, ['A2']);
    await expect(receipts.cancelGoodsReceipt(f.companyId, receipt.id)).rejects.toThrow(/ya no está en bodega/);
    expect(await prisma.productSerial.count({ where: { companyId: f.companyId } })).toBe(3);

    const g = await fixture();
    const r2 = await receive(g, 'B1,B2,B3');
    await receipts.cancelGoodsReceipt(g.companyId, r2.id);
    expect(await prisma.productSerial.count({ where: { companyId: g.companyId } })).toBe(0);
  });

  it('traslada series entre bodegas moviendo también el stock, y no mezcla bodegas', async () => {
    const f = await fixture();
    await receive(f, 'T1,T2,T3');
    const ids = (await prisma.productSerial.findMany({ where: { companyId: f.companyId, serial: { in: ['T1', 'T2'] } } })).map((s) => s.id);
    const result = await trace.transferSerials(f.companyId, f.user.id, { productId: f.product.id, serialIds: ids, toWarehouseId: f.w2.id });
    expect(result.moved).toBe(2);
    const stocks = await prisma.stock.findMany({ where: { companyId: f.companyId, productId: f.product.id } });
    expect(Object.fromEntries(stocks.map((s) => [s.warehouseId, s.quantity]))).toEqual({ [f.w1.id]: 1, [f.w2.id]: 2 });
    const moved = await prisma.productSerial.findMany({ where: { companyId: f.companyId, warehouseId: f.w2.id } });
    expect(moved.map((s) => s.serial).sort()).toEqual(['T1', 'T2']);
    // Pedir trasladar de nuevo hacia la misma bodega de origen falla sin tocar nada.
    await expect(trace.transferSerials(f.companyId, f.user.id, { productId: f.product.id, serialIds: [ids[0]!], toWarehouseId: f.w2.id })).rejects.toThrow(/distintas/);
  });

  it('cambia el estado de una serie con sus reglas y deja la historia', async () => {
    const f = await fixture();
    await receive(f, 'E1,E2,E3');
    const e1 = await prisma.productSerial.findFirstOrThrow({ where: { companyId: f.companyId, serial: 'E1' } });
    await expect(trace.changeSerialStatus(f.companyId, f.user.id, { serialId: e1.id, to: 'LOST' })).rejects.toThrow(/Explica/);
    await trace.changeSerialStatus(f.companyId, f.user.id, { serialId: e1.id, to: 'LOST', note: 'Robo en tienda' });
    await expect(trace.changeSerialStatus(f.companyId, f.user.id, { serialId: e1.id, to: 'SOLD' })).rejects.toThrow(/no puede pasar/);
    await trace.changeSerialStatus(f.companyId, f.user.id, { serialId: e1.id, to: 'IN_STOCK', warehouseId: f.w2.id });
    const events = await prisma.productSerialEvent.findMany({ where: { serialId: e1.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.kind)).toEqual(['REGISTERED', 'LOST', 'REOPENED']);
  });

  it('genealogía de un lote: proveedor, ventas y clientes netos, cuadre y existencias', async () => {
    const f = await fixture();
    await receive(f, 'G1,G2,G3', 3, 'L-9');
    const d1 = await sell(f, f.customerA.id, ['G1']);
    await sell(f, f.customerB.id, ['G2']);
    await sales.cancelSalesDocument(f.companyId, d1.id, 'Devolución total');

    const result = await genealogy.traceLot(f.companyId, f.product.id, 'L-9', { includeCustomers: true });
    expect(result).not.toBeNull();
    expect(result!.suppliers).toEqual(['Proveedor Andes']);
    expect(result!.entries[0]).toMatchObject({ document: expect.stringContaining('Recepción #1'), quantity: 3 });
    // La venta anulada no cuenta: solo Beto sigue siendo cliente alcanzado.
    expect(result!.customers.map((c) => [c.name, c.quantity])).toEqual([['Beto Rojas', 1]]);
    expect(result!.stock).toEqual([{ warehouse: 'Central', quantity: 2 }]);
    expect(result!.reconciliation).toMatchObject({ received: 4, dispatched: 2, inStock: 2, balanced: true });

    const hidden = await genealogy.traceLot(f.companyId, f.product.id, 'L-9', { includeCustomers: false });
    expect(hidden!.customers).toEqual([]);
    expect(hidden!.customersHidden).toBe(true);
    expect(await genealogy.traceLot(f.companyId, f.product.id, 'NO-LOTE', { includeCustomers: true })).toBeNull();
  });

  it('un lote de otra empresa no se ve', async () => {
    const a = await fixture();
    const b = await fixture();
    await receive(a, 'X1,X2,X3', 3, 'L-SECRETO');
    expect(await genealogy.traceLot(b.companyId, a.product.id, 'L-SECRETO', { includeCustomers: true })).toBeNull();
    expect(await trace.lookupSerial(b.companyId, 'X1', { includeCustomer: true })).toEqual([]);
    expect(await trace.getProductFlow(b.companyId, a.product.id, { days: 30 })).toBeNull();
  });

  it('la producción une los lotes: insumo → producto terminado → cliente', async () => {
    const f = await fixture();
    const input = await prisma.product.create({ data: { companyId: f.companyId, sku: `IN-${run}-${counter}`, name: 'Pantalla', netPrice: 100, grossPrice: 119, isTrackable: true, tracksLots: true } });
    const output = await prisma.product.create({ data: { companyId: f.companyId, sku: `OUT-${run}-${counter}`, name: 'Kit armado', netPrice: 2000, grossPrice: 2380, isTrackable: true, tracksLots: true } });
    const stockMod = await import('@/modules/inventory/services/stock.service');
    await stockMod.registerStockIn(f.companyId, { productId: input.id, warehouseId: f.w1.id, type: 'PURCHASE_IN', quantity: 10, unitCost: 50, supplierId: f.supplier.id, lots: [{ lotNumber: 'P-7', quantity: 10 }] });
    const order = await prisma.productionOrder.create({
      data: { companyId: f.companyId, folio: 1, productId: output.id, quantity: 4, warehouseId: f.w1.id, status: 'PLANNED', components: { create: [{ companyId: f.companyId, productId: input.id, plannedQuantity: 4 }] } },
    });
    await manufacturing.completeProductionOrder(f.companyId, f.user.id, order.id, { producedQuantity: 4, consumed: {}, additionalCost: 0, outputLotNumber: 'K-1' });
    await sales.createSalesDocument(f.companyId, { contactId: f.customerA.id, warehouseId: f.w1.id, dteType: 'BOLETA_39', paymentMethod: 'EFECTIVO', items: [{ productId: output.id, description: 'Kit armado', quantity: 2, unitPrice: 2000 }] }, 'ISSUED');

    // Hacia atrás desde el producto terminado: el insumo y su proveedor.
    const made = await genealogy.traceLot(f.companyId, output.id, 'K-1', { includeCustomers: true });
    expect(made!.madeIn).toHaveLength(1);
    expect(made!.madeIn[0]!.inputs).toEqual([{ productName: 'Pantalla', lotNumber: 'P-7', quantity: 4, suppliers: ['Proveedor Andes'] }]);
    expect(made!.customers.map((c) => [c.name, c.quantity])).toEqual([['Ana Soto', 2]]);

    // Hacia adelante desde el insumo: a qué se transformó y qué clientes lo recibieron.
    const upstream = await genealogy.traceLot(f.companyId, input.id, 'P-7', { includeCustomers: true });
    expect(upstream!.usedInProduction).toHaveLength(1);
    expect(upstream!.usedInProduction[0]).toMatchObject({ outputProduct: 'Kit armado', outputLot: 'K-1' });
    expect(upstream!.usedInProduction[0]!.customers.map((c) => [c.name, c.quantity])).toEqual([['Ana Soto', 2]]);
    expect(upstream!.reconciliation).toMatchObject({ received: 10, dispatched: 4, inStock: 6, balanced: true });
  });

  it('el tablero y el panel 360 leen datos reales', async () => {
    const f = await fixture();
    await receive(f, 'F1,F2,F3', 3, 'L-5');
    await sell(f, f.customerA.id, undefined);
    const flow = await trace.getProductFlow(f.companyId, f.product.id, { days: 30 });
    expect(flow!.received).toMatchObject({ count: 1, quantity: 3 });
    expect(flow!.sold).toMatchObject({ count: 1, quantity: 1 });
    expect(flow!.inTransit.total).toBe(2);
    expect(flow!.inWarehouse.total).toBe(2);
    // Hay 2 en stock pero 3 series registradas: el tablero lo marca.
    expect(flow!.inWarehouse.warehouses[0]!.serials.state).toBe('OVER');

    const panel = await overview.getTraceabilityOverview(f.companyId);
    expect(panel.products).toMatchObject({ withLots: 1, withSerials: 1 });
    expect(panel.serials.inStock).toBe(3);
    expect(panel.serials.mismatches).toBe(1);
    const ids = panel.attention.map((a) => a.id);
    // La venta de un producto con serie sin indicar series queda pendiente a la vista.
    expect(ids).toContain('unassigned-serial-sales');
    expect(ids).toContain('serial-mismatch');
  });

  it('el POS vende por serie: la boleta queda ligada a las series, con garantía, y un error no cobra nada', async () => {
    const f = await fixture();
    await receive(f, 'POS-1,POS-2,POS-3');
    const register = await prisma.cashRegister.create({ data: { companyId: f.companyId, name: 'Caja 1', warehouseId: f.w1.id } });
    const shift = await prisma.cashShift.create({ data: { companyId: f.companyId, cashRegisterId: register.id, userId: f.user.id, initialAmount: 0 } });

    const catalog = await pos.listPosProducts(f.companyId, f.w1.id);
    expect(catalog.find((p) => p.id === f.product.id)?.tracksSerials).toBe(true);

    // Serie inexistente: se rechaza y no se mueve stock ni se emite nada.
    await expect(pos.createPosSale(f.companyId, f.user.id, shift.id, { items: [{ productId: f.product.id, quantity: 1, serials: ['NO-ESTA'] }], paymentMethod: 'EFECTIVO', cashReceived: 5000, idempotencyKey: `k-${run}-1` })).rejects.toThrow(/no está registrada/);
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId } })).toBe(0);
    expect((await prisma.stock.findFirstOrThrow({ where: { companyId: f.companyId, productId: f.product.id } })).quantity).toBe(3);

    const sale = await pos.createPosSale(f.companyId, f.user.id, shift.id, { items: [{ productId: f.product.id, quantity: 2, serials: ['pos-1', 'POS-3'] }], paymentMethod: 'EFECTIVO', cashReceived: 5000, idempotencyKey: `k-${run}-2` });
    const sold = await prisma.productSerial.findMany({ where: { companyId: f.companyId, status: 'SOLD' }, orderBy: { serial: 'asc' } });
    expect(sold.map((x) => x.serial)).toEqual(['POS-1', 'POS-3']);
    expect(sold.every((x) => x.salesDocumentId === sale.id && x.warrantyUntil !== null)).toBe(true);
    const events = await prisma.productSerialEvent.findMany({ where: { serialId: sold[0]!.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.kind)).toEqual(['REGISTERED', 'SOLD']);
    const [journey] = await trace.lookupSerial(f.companyId, 'POS-3', { includeCustomer: true });
    expect(journey!.sale).toContain('Boleta');
    // Los eventos con operario (el cajero) muestran su nombre en la serie y en la línea de tiempo.
    expect(journey!.events.find((e) => e.title === 'Vendida')?.actor).toBe('Bodeguero Beto');
    const flow = await trace.getProductFlow(f.companyId, f.product.id, { days: 30 });
    expect(flow!.timeline.some((entry) => entry.source === 'serial' && entry.actor === 'Bodeguero Beto')).toBe(true);
  });
});

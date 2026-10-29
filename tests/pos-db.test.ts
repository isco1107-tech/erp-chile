/**
 * POS multicaja contra PostgreSQL real. Solo se habilita sobre una base LOCAL
 * desechable terminada en `_test`; nunca usa la DATABASE_URL del .env (producción).
 *
 * WAREHOUSE_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/erp_pos_test \
 *   npx jest tests/pos-db.test.ts --runInBand
 */
import type { PrismaClient } from '@prisma/client';
import type { PosSaleInput } from '@/modules/pos/schema';

const TEST_URL = process.env.WAREHOUSE_TEST_DATABASE_URL;
const safeDatabase = (url: string | undefined): url is string => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)
      && /_test$/.test(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
};
const describeDb = safeDatabase(TEST_URL) ? describe : describe.skip;

jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn(async () => undefined) }));
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn(async () => undefined) }));
jest.mock('@/lib/supersuite', () => ({ latidoCajaSupersuite: jest.fn() }));

interface Fixture {
  companyId: string;
  warehouseId: string;
  user1: string;
  user2: string;
  register1: string;
  register2: string;
  product1: string;
  product2: string;
}

jest.setTimeout(60_000);

describeDb('POS multicaja contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let cash: typeof import('@/modules/pos/services/cash.service');
  let pos: typeof import('@/modules/pos/services/pos.service');
  let stock: typeof import('@/modules/inventory/services/stock.service');
  const companyIds: string[] = [];
  const run = Math.random().toString(36).slice(2, 10);
  let fixtureIndex = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    cash = await import('@/modules/pos/services/cash.service');
    pos = await import('@/modules/pos/services/pos.service');
    stock = await import('@/modules/inventory/services/stock.service');
  });

  async function fixture(options: { quantity?: number; accounting?: boolean } = {}): Promise<Fixture> {
    const key = `${run}-${++fixtureIndex}`;
    const company = await prisma.company.create({
      data: {
        rut: `pos-${key}`,
        businessName: `POS prueba ${key}`,
        features: { create: { hasPos: true, hasInventory: true, hasAccounting: options.accounting ?? false } },
        settings: { create: { allowNegativeStock: false } },
      },
    });
    companyIds.push(company.id);
    if (options.accounting) {
      const { ensureChartOfAccounts } = await import('@/modules/accounting/services/chart-setup.service');
      await ensureChartOfAccounts(company.id);
    }
    const warehouse = await prisma.warehouse.create({ data: { companyId: company.id, name: 'Bodega POS', code: 'POS', isDefault: true } });
    const user = (n: number) => prisma.user.create({
      data: { companyId: company.id, email: `pos-${key}-${n}@test.cl`, name: `Cajero ${n}`, role: 'SALES', passwordHash: 'test-not-a-real-password' },
    });
    const [user1, user2] = await Promise.all([user(1), user(2)]);
    const register1 = await cash.createCashRegister(company.id, { name: 'Caja 1', warehouseId: warehouse.id });
    const register2 = await cash.createCashRegister(company.id, { name: 'Caja 2', warehouseId: warehouse.id });
    const product = (n: number, netPrice: number) => prisma.product.create({
      data: { companyId: company.id, sku: `POS-${n}`, name: `Producto POS ${n}`, netPrice, grossPrice: Math.round(netPrice * 1.19), isTrackable: true },
    });
    const [product1, product2] = await Promise.all([product(1, 1000), product(2, 2000)]);
    for (const [p, cost] of [[product1, 400], [product2, 700]] as const) {
      await stock.registerStockIn(company.id, { productId: p.id, warehouseId: warehouse.id, type: 'ADJUSTMENT_IN', quantity: options.quantity ?? 20, unitCost: cost, userId: user1.id });
    }
    return { companyId: company.id, warehouseId: warehouse.id, user1: user1.id, user2: user2.id, register1: register1.id, register2: register2.id, product1: product1.id, product2: product2.id };
  }

  const saleInput = (f: Fixture, overrides: Partial<PosSaleInput> = {}): PosSaleInput => ({
    items: [{ productId: f.product1, quantity: 1 }], paymentMethod: 'EFECTIVO', cashReceived: 10_000, ...overrides,
  });
  const quantity = async (f: Fixture, productId = f.product1) => (await prisma.stock.findUniqueOrThrow({
    where: { companyId_productId_warehouseId: { companyId: f.companyId, productId, warehouseId: f.warehouseId } },
  })).quantity;
  const openBoth = async (f: Fixture) => Promise.all([
    cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 10_000 }),
    cash.openShift(f.companyId, f.user2, { cashRegisterId: f.register2, initialAmount: 20_000 }),
  ]);

  afterAll(async () => {
    if (!prisma) return;
    // Solo en la base descartable: el libro real es inmutable. La limpieza
    // corre con los triggers desactivados dentro de una transacción atómica.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('ALTER TABLE "JournalEntry" DISABLE TRIGGER "trg_journal_entry_immutable"');
        await tx.$executeRawUnsafe('ALTER TABLE "JournalLine" DISABLE TRIGGER "trg_journal_line_immutable"');
        for (const companyId of companyIds) {
          await tx.account.updateMany({ where: { companyId }, data: { parentId: null } });
          await tx.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
          await tx.accountMapping.deleteMany({ where: { companyId } });
          await tx.journalLine.deleteMany({ where: { companyId } });
          await tx.journalEntry.deleteMany({ where: { companyId } });
          await tx.journalEntrySequence.deleteMany({ where: { companyId } });
          await tx.account.deleteMany({ where: { companyId } });
          await tx.accountingPeriod.deleteMany({ where: { companyId } });
          await tx.storeStockReservation.deleteMany({ where: { companyId } });
          await tx.storeOrder.deleteMany({ where: { companyId } });
          await tx.webSite.deleteMany({ where: { companyId } });
          await tx.payment.deleteMany({ where: { companyId } });
          await tx.salesDocumentItem.deleteMany({ where: { companyId } });
          await tx.salesDocument.deleteMany({ where: { companyId } });
          await tx.cashMovement.deleteMany({ where: { companyId } });
          await tx.cashShift.deleteMany({ where: { companyId } });
          await tx.cashRegister.deleteMany({ where: { companyId } });
          await tx.folioSequence.deleteMany({ where: { companyId } });
          await tx.inventoryLot.deleteMany({ where: { companyId } });
          await tx.inventoryMovement.deleteMany({ where: { companyId } });
          await tx.stock.deleteMany({ where: { companyId } });
          await tx.product.deleteMany({ where: { companyId } });
          await tx.contact.deleteMany({ where: { companyId } });
          await tx.warehouse.deleteMany({ where: { companyId } });
          await tx.user.deleteMany({ where: { companyId } });
          await tx.company.deleteMany({ where: { id: companyId } });
        }
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
        await tx.$executeRawUnsafe('ALTER TABLE "JournalEntry" ENABLE TRIGGER "trg_journal_entry_immutable"');
        await tx.$executeRawUnsafe('ALTER TABLE "JournalLine" ENABLE TRIGGER "trg_journal_line_immutable"');
      }, { timeout: 60_000 });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('Control consolida ventas, cobros y efectivo sin mezclar empresas', async () => {
    const f = await fixture();
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 10000 });
    await pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f));
    await cash.registerCashMovement(f.companyId, shift.id, f.user1, {type:'INFLOW',amount:1000,reason:'Refuerzo de fondo'});
    const other = await fixture();
    const otherShift = await cash.openShift(other.companyId, other.user1, {cashRegisterId:other.register1,initialAmount:99999});
    await pos.createPosSale(other.companyId,other.user1,otherShift.id,saleInput(other));
    const { controlSnapshot } = await import('@/modules/control/service');
    const snapshot = await controlSnapshot({companyId:f.companyId,companyName:'Mi empresa',name:'Dueño',permissions:['sales:read','products:read','treasury:read','pos:operate'],features:{hasDteBilling:true,hasPos:true,hasInventory:true}} as unknown as import('@/lib/auth/guards').AuthContext);
    expect(snapshot).toMatchObject({salesToday:1190,salesMonth:1190,incomeToday:1190,expenseToday:0,openRegisters:1});
    // Una empresa que vende SOLO por el POS (sin Facturación) también ve sus ventas en Control.
    const posOnly = await controlSnapshot({companyId:f.companyId,companyName:'Mi empresa',name:'Dueño',permissions:['products:read','pos:operate','pos:close'],features:{hasDteBilling:false,hasPos:true,hasInventory:true}} as unknown as import('@/lib/auth/guards').AuthContext);
    expect(posOnly).toMatchObject({salesToday:1190,salesMonth:1190,documentsToday:1});
    expect(snapshot.registers).toHaveLength(1);
    expect(snapshot.registers[0]).toMatchObject({id:shift.id,name:'Caja 1',expected:12190});
    expect(snapshot.registers[0].cashier).toMatch(/^Cajero \d+$/);
    expect(snapshot.activity.filter(event=>event.kind==='sale')).toHaveLength(1);
    expect(snapshot.activity.some(event=>event.kind==='cash' && event.amount===1000 && event.detail.startsWith('Caja 1 · Refuerzo de fondo · Cajero '))).toBe(true);
    expect(snapshot.activity.some(event=>event.kind==='stock' && event.label.startsWith('Producto POS') && event.detail.startsWith('Bodega POS · '))).toBe(true);
  });

  it('un producto sin precio de venta (creado desde la bodega) no se vende por $0', async () => {
    const f = await fixture();
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 0 });
    await prisma.product.updateMany({ where: { id: f.product1, companyId: f.companyId }, data: { netPrice: 0, grossPrice: 0 } });
    await expect(pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, { idempotencyKey: `sin-precio-${run}` }))).rejects.toThrow(/no tiene precio de venta/);
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId } })).toBe(0);
  });

  it('el nombre del cliente por RUT sale solo de la empresa y nunca del consumidor final ni de un proveedor', async () => {
    const a = await fixture();
    const b = await fixture();
    await prisma.contact.create({ data: { companyId: a.companyId, rut: '12.345.678-5', rutClean: '123456785', razonSocial: 'Ana Soto', isCustomer: true } });
    await prisma.contact.create({ data: { companyId: a.companyId, rut: '10.000.013-K', rutClean: '10000013K', razonSocial: 'Proveedor Sur', isCustomer: false, isSupplier: true } });
    await prisma.$transaction((tx) => pos.getOrCreateGenericCustomer(tx, a.companyId));
    expect(await pos.findCustomerNameByRut(a.companyId, '12.345.678-5')).toBe('Ana Soto');
    expect(await pos.findCustomerNameByRut(a.companyId, ' 123456785 ')).toBe('Ana Soto');
    expect(await pos.findCustomerNameByRut(b.companyId, '12.345.678-5')).toBeNull();
    expect(await pos.findCustomerNameByRut(a.companyId, '12.345.678-9')).toBeNull();
    expect(await pos.findCustomerNameByRut(a.companyId, '10.000.013-K')).toBeNull();
    expect(await pos.findCustomerNameByRut(a.companyId, '66.666.666-6')).toBeNull();
    expect(await pos.findCustomerNameByRut(a.companyId, 'no es un rut')).toBeNull();
  });

  it('el primer acceso concurrente provisiona una sola Caja Principal disponible', async () => {
    const f = await fixture();
    await prisma.cashRegister.deleteMany({ where: { companyId: f.companyId } });
    const results = await Promise.all(Array.from({ length: 3 }, () => cash.ensureDefaultCashRegister(f.companyId)));
    expect(results.every((r) => r !== null && r.isActive && r.warehouseId === f.warehouseId)).toBe(true);
    expect(new Set(results.map((r) => r!.id)).size).toBe(1);
    expect(await prisma.cashRegister.count({ where: { companyId: f.companyId } })).toBe(1);
  });

  it('una caja y un cajero solo pueden tener un turno abierto, incluso con aperturas simultáneas', async () => {
    const f = await fixture();
    const attempts = await Promise.allSettled([
      cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 1000 }),
      cash.openShift(f.companyId, f.user2, { cashRegisterId: f.register1, initialAmount: 2000 }),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const shift = await prisma.cashShift.findFirstOrThrow({ where: { companyId: f.companyId, status: 'OPEN' } });
    await expect(cash.openShift(f.companyId, shift.userId!, { cashRegisterId: f.register2, initialAmount: 1000 })).rejects.toThrow('turno');
    expect(await prisma.cashShift.count({ where: { companyId: f.companyId, status: 'OPEN' } })).toBe(1);
  });

  it('dos primeras ventas simultáneas comparten receptor, respetan el stock y guardan caja, cajero y cobro', async () => {
    const f = await fixture();
    const [s1, s2] = await openBoth(f);
    const [a, b] = await Promise.all([
      pos.createPosSale(f.companyId, f.user1, s1.id, saleInput(f, { items: [{ productId: f.product1, quantity: 1 }, { productId: f.product2, quantity: 1 }], idempotencyKey: `sale-${run}-a` })),
      pos.createPosSale(f.companyId, f.user2, s2.id, saleInput(f, { items: [{ productId: f.product2, quantity: 1 }, { productId: f.product1, quantity: 1 }], paymentMethod: 'TARJETA_DEBITO', idempotencyKey: `sale-${run}-b` })),
    ]);
    expect(a.totalAmount).toBe(3570);
    expect(b.totalAmount).toBe(3570);
    expect(a.folio).not.toBe(b.folio);
    expect(a).toMatchObject({ cashShiftId: s1.id, sellerId: f.user1, paidAmount: 3570, paymentStatus: 'PAID' });
    expect(b).toMatchObject({ cashShiftId: s2.id, sellerId: f.user2, paidAmount: 3570, paymentStatus: 'PAID' });
    expect(a.contactId).toBe(b.contactId);
    expect(await prisma.contact.count({ where: { companyId: f.companyId, rutClean: '666666666' } })).toBe(1);
    expect(await quantity(f)).toBe(18);
    expect(await quantity(f, f.product2)).toBe(18);
    const payments = await prisma.payment.findMany({ where: { companyId: f.companyId }, orderBy: { amount: 'asc' } });
    expect(payments).toHaveLength(2);
    expect(payments.map((p) => p.salesDocumentId).sort()).toEqual([a.id, b.id].sort());
    expect(payments.every((p) => p.amount === 3570 && p.type === 'INCOME')).toBe(true);
    const movements = await prisma.inventoryMovement.findMany({ where: { companyId: f.companyId, type: 'SALE_OUT' } });
    expect(movements).toHaveLength(4);
    expect(movements.filter((m) => m.userId === f.user1)).toHaveLength(2);
    expect(movements.filter((m) => m.userId === f.user2)).toHaveLength(2);
    expect((await cash.getShiftSummary(f.companyId, s1.id)).expectedAmount).toBe(13_570);
    expect((await cash.getShiftSummary(f.companyId, s2.id)).expectedAmount).toBe(20_000);
  });

  it('Ventas ERP y POS emiten al mismo tiempo sin cruzar locks de productos y folio', async () => {
    const f = await fixture();
    const { createSalesDocument } = await import('@/modules/sales/services/sales.service');
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 10_000 });
    const contactId = await prisma.$transaction((tx) => pos.getOrCreateGenericCustomer(tx, f.companyId));
    const folios: number[] = [];
    const invoiceFolios: number[] = [];
    // Varias carreras con los mismos productos en orden opuesto: ambos
    // canales comparten stock; se prueba tanto el mismo contador de boleta
    // como el contador independiente de factura con los mismos productos.
    for (let round = 0; round < 4; round++) {
      const dteType = round < 2 ? 'BOLETA_39' : 'FACTURA_33';
      const [counterSale, erpSale] = await Promise.all([
        pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, {
          items: [{ productId: f.product2, quantity: 1 }, { productId: f.product1, quantity: 1 }],
          idempotencyKey: `pos-interchannel-${run}-${round}`,
        })),
        createSalesDocument(f.companyId, {
          contactId, warehouseId: f.warehouseId, dteType, paymentMethod: 'EFECTIVO',
          items: [
            { productId: f.product1, description: 'Producto POS 1', quantity: 1, unitPrice: 1000 },
            { productId: f.product2, description: 'Producto POS 2', quantity: 1, unitPrice: 2000 },
          ],
          idempotencyKey: `erp-interchannel-${run}-${round}`,
        }, 'ISSUED'),
      ]);
      expect(counterSale.totalAmount).toBe(3570);
      expect(erpSale.totalAmount).toBe(3570);
      folios.push(counterSale.folio!);
      if (dteType === 'BOLETA_39') folios.push(erpSale.folio!);
      else invoiceFolios.push(erpSale.folio!);
    }
    expect(new Set(folios).size).toBe(6);
    expect(folios.slice().sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(invoiceFolios.slice().sort((a, b) => a - b)).toEqual([1, 2]);
    expect(await quantity(f)).toBe(12);
    expect(await quantity(f, f.product2)).toBe(12);
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId, status: 'ISSUED' } })).toBe(8);
    expect(await prisma.inventoryMovement.count({ where: { companyId: f.companyId, type: 'SALE_OUT' } })).toBe(16);
    expect((await cash.getShiftSummary(f.companyId, shift.id)).salesTotal).toBe(4 * 3570);
  });

  it('la última unidad solo puede venderse una vez entre dos cajas', async () => {
    const f = await fixture({ quantity: 1 });
    const [s1, s2] = await openBoth(f);
    // Preexiste el receptor para que esta carrera mida exclusivamente stock.
    await prisma.$transaction((tx) => pos.getOrCreateGenericCustomer(tx, f.companyId));
    const attempts = await Promise.allSettled([
      pos.createPosSale(f.companyId, f.user1, s1.id, saleInput(f)),
      pos.createPosSale(f.companyId, f.user2, s2.id, saleInput(f)),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await quantity(f)).toBe(0);
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId } })).toBe(1);
    expect(await prisma.payment.count({ where: { companyId: f.companyId } })).toBe(1);
    expect(await prisma.inventoryMovement.count({ where: { companyId: f.companyId, type: 'SALE_OUT' } })).toBe(1);
  });

  it('un doble envío de venta cobra y descuenta una sola vez, sin aceptar claves de otra caja', async () => {
    const f = await fixture();
    const [s1, s2] = await openBoth(f);
    const input = saleInput(f, { idempotencyKey: `retry-${run}` });
    const results = await Promise.all([
      pos.createPosSale(f.companyId, f.user1, s1.id, input),
      pos.createPosSale(f.companyId, f.user1, s1.id, input),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(await quantity(f)).toBe(19);
    expect(await prisma.payment.count({ where: { companyId: f.companyId } })).toBe(1);
    await expect(pos.createPosSale(f.companyId, f.user1, s1.id, { ...input, customerRut: '12.345.678-5' })).rejects.toThrow('otra operación');
    await expect(pos.createPosSale(f.companyId, f.user2, s2.id, input)).rejects.toThrow();
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId } })).toBe(1);
    expect((await cash.getShiftSummary(f.companyId, s2.id)).salesTotal).toBe(0);
    const { cancelSalesDocument } = await import('@/modules/sales/services/sales.service');
    await cancelSalesDocument(f.companyId, results[0]!.id, 'Venta ingresada por error');
    expect(await quantity(f)).toBe(20);
    await expect(pos.createPosSale(f.companyId, f.user1, s1.id, input)).rejects.toThrow('ya fue anulada');
    expect(await quantity(f)).toBe(20);
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId } })).toBe(1);
    expect((await cash.getShiftSummary(f.companyId, s1.id)).salesTotal).toBe(0);
  });

  it('el cliente no puede rebajar precios ni descuentos, ni vender un producto desactivado', async () => {
    const f = await fixture();
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 0 });
    const sale = await pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, { items: [{ productId: f.product1, quantity: 1, unitPrice: 1, discountPercent: 100 }] }));
    expect(sale).toMatchObject({ netAmount: 1000, ivaAmount: 190, totalAmount: 1190 });
    expect(sale.items[0]).toMatchObject({ unitPrice: 1000, discountPercent: 0, unitCostPMP: 400 });
    await prisma.product.updateMany({ where: { companyId: f.companyId, id: f.product2 }, data: { isActive: false } });
    await expect(pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, { items: [{ productId: f.product2, quantity: 1 }] }))).rejects.toThrow();
    expect(await quantity(f, f.product2)).toBe(20);
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId } })).toBe(1);
  });

  it('solo el cajero dueño registra movimientos y los reintentos no duplican el efectivo', async () => {
    const f = await fixture();
    const [s1] = await openBoth(f);
    await expect(cash.registerCashMovement(f.companyId, s1.id, f.user2, { type: 'INFLOW', amount: 1000, reason: 'Fondo ajeno' })).rejects.toThrow();
    const input = { type: 'INFLOW' as const, amount: 3000, reason: 'Fondo de cambio', idempotencyKey: `cash-${run}` };
    const attempts = await Promise.all(Array.from({ length: 3 }, () => cash.registerCashMovement(f.companyId, s1.id, f.user1, input)));
    expect(new Set(attempts.map((m) => m.id)).size).toBe(1);
    expect(await prisma.cashMovement.count({ where: { companyId: f.companyId, cashShiftId: s1.id } })).toBe(1);
    expect((await cash.getShiftSummary(f.companyId, s1.id)).expectedAmount).toBe(13_000);
    await expect(cash.registerCashMovement(f.companyId, s1.id, f.user1, { ...input, amount: 9000 })).rejects.toThrow();
    expect((await cash.getShiftSummary(f.companyId, s1.id)).inflows).toBe(3000);
  });

  it('un retiro exige efectivo suficiente y dos retiros simultáneos no vacían dos veces el mismo saldo', async () => {
    const f = await fixture();
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 1000 });
    await expect(cash.registerCashMovement(f.companyId, shift.id, f.user1, { type: 'OUTFLOW', amount: 1001, reason: 'Retiro excesivo' })).rejects.toThrow();
    const attempts = await Promise.allSettled([
      cash.registerCashMovement(f.companyId, shift.id, f.user1, { type: 'OUTFLOW', amount: 700, reason: 'Retiro uno' }),
      cash.registerCashMovement(f.companyId, shift.id, f.user1, { type: 'OUTFLOW', amount: 700, reason: 'Retiro dos' }),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await cash.getShiftSummary(f.companyId, shift.id)).expectedAmount).toBe(300);
    expect(await prisma.cashMovement.count({ where: { companyId: f.companyId, cashShiftId: shift.id } })).toBe(1);
  });

  it('el arqueo integra ventas, banco, ingresos, retiros y descuadre contable sin duplicar ventas al cerrar', async () => {
    const f = await fixture({ accounting: true });
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 10_000 });
    const cashSale = await pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, { items: [{ productId: f.product1, quantity: 2 }], cashReceived: 3000 }));
    const cardSale = await pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, { items: [{ productId: f.product2, quantity: 1 }], paymentMethod: 'TARJETA_CREDITO' }));
    expect(cashSale.changeDue).toBe(620);
    await cash.registerCashMovement(f.companyId, shift.id, f.user1, { type: 'INFLOW', amount: 5000, reason: 'Fondo de cambio' });
    await cash.registerCashMovement(f.companyId, shift.id, f.user1, { type: 'OUTFLOW', amount: 1500, reason: 'Retiro a caja fuerte' });
    const summary = await cash.getShiftSummary(f.companyId, shift.id);
    expect(summary).toMatchObject({ initialAmount: 10_000, cashSales: 2380, inflows: 5000, outflows: 1500, salesTotal: 4760, documentCount: 2, expectedAmount: 15_880 });
    expect(summary.byPaymentMethod).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'EFECTIVO', total: 2380 }),
      expect.objectContaining({ method: 'TARJETA_CREDITO', total: 2380 }),
    ]));
    await expect(cash.closeShift(f.companyId, shift.id, { actualAmount: 15_800 })).rejects.toThrow('Explica el faltante o sobrante');
    await expect(cash.closeShift(f.companyId, shift.id, { actualAmount: 15_800, closingNotes: '  x  ' })).rejects.toThrow('Explica el faltante o sobrante');
    expect((await prisma.cashShift.findFirstOrThrow({ where: { companyId: f.companyId, id: shift.id } })).status).toBe('OPEN');
    expect(await prisma.journalEntry.count({ where: { companyId: f.companyId, sourceType: 'CASH_SHIFT', sourceId: shift.id } })).toBe(0);
    const closeInput = { actualAmount: 15_800, closingNotes: 'Faltante contado y revisado' };
    const closed = await cash.closeShift(f.companyId, shift.id, closeInput);
    const replay = await cash.closeShift(f.companyId, shift.id, closeInput);
    expect(replay.shift).toEqual(closed.shift);
    expect(replay.summary).toEqual(closed.summary);
    await expect(cash.closeShift(f.companyId, shift.id, { ...closeInput, closingNotes: 'Una explicación distinta' })).rejects.toThrow('ya fue cerrado');
    await expect(cash.closeShift(f.companyId, shift.id, { ...closeInput, actualAmount: 15_900 })).rejects.toThrow('ya fue cerrado');
    expect(closed.shift).toMatchObject({ status: 'CLOSED', expectedAmount: 15_880, actualAmount: 15_800, difference: -80, closingNotes: 'Faltante contado y revisado' });
    expect(closed.shift.closedAt).toBeInstanceOf(Date);
    const salesEntries = await prisma.journalEntry.findMany({ where: { companyId: f.companyId, sourceType: 'SALES_DOCUMENT', sourceId: { in: [cashSale.id, cardSale.id] } }, include: { lines: true } });
    expect(salesEntries).toHaveLength(4); // ingreso + costo por cada boleta; el cierre no los repite.
    const closeEntries = await prisma.journalEntry.findMany({ where: { companyId: f.companyId, sourceType: 'CASH_SHIFT', sourceId: shift.id }, include: { lines: true } });
    expect(closeEntries).toHaveLength(1);
    for (const entry of [...salesEntries, ...closeEntries]) {
      expect(entry.status).toBe('POSTED');
      expect(entry.lines.reduce((n, l) => n + l.debit, 0)).toBe(entry.lines.reduce((n, l) => n + l.credit, 0));
    }
    const mapping = await prisma.accountMapping.findMany({ where: { companyId: f.companyId, key: { in: ['CAJA', 'BANCO'] } } });
    const accountId = (key: string) => mapping.find((m) => m.key === key)!.accountId;
    expect(salesEntries.flatMap((e) => e.lines).filter((l) => l.accountId === accountId('CAJA')).reduce((n, l) => n + l.debit - l.credit, 0)).toBe(2380);
    expect(salesEntries.flatMap((e) => e.lines).filter((l) => l.accountId === accountId('BANCO')).reduce((n, l) => n + l.debit - l.credit, 0)).toBe(2380);
    await expect(cash.registerCashMovement(f.companyId, shift.id, f.user1, { type: 'INFLOW', amount: 1, reason: 'Después de cerrar' })).rejects.toThrow();
    await expect(pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f))).rejects.toThrow();
    await expect(cash.closeShift(f.companyId, shift.id, { actualAmount: 0 })).rejects.toThrow();
    expect(await prisma.journalEntry.count({ where: { companyId: f.companyId, sourceType: 'CASH_SHIFT', sourceId: shift.id } })).toBe(1);
    expect((await prisma.cashShift.findFirstOrThrow({ where: { companyId: f.companyId, id: shift.id } })).actualAmount).toBe(15_800);
  });

  it('cierre y venta concurrentes dejan el resumen congelado exactamente con las ventas confirmadas', async () => {
    const f = await fixture();
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 10_000 });
    const [closing, selling] = await Promise.allSettled([
      cash.closeShift(f.companyId, shift.id, { actualAmount: 10_000, closingNotes: 'Conteo simultáneo al cierre de turno' }),
      pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f)),
    ]);
    expect(closing.status).toBe('fulfilled');
    const persisted = await prisma.cashShift.findFirstOrThrow({ where: { companyId: f.companyId, id: shift.id } });
    const confirmed = selling.status === 'fulfilled' ? 1190 : 0;
    expect(persisted).toMatchObject({ status: 'CLOSED', expectedAmount: 10_000 + confirmed, actualAmount: 10_000, difference: confirmed ? -confirmed : 0 });
    expect((await cash.getShiftSummary(f.companyId, shift.id)).cashSales).toBe(confirmed);
    expect(await prisma.payment.count({ where: { companyId: f.companyId } })).toBe(confirmed ? 1 : 0);
    expect(await quantity(f)).toBe(confirmed ? 19 : 20);
  });

  it('el POS conserva cantidades fraccionarias disponibles tras reservar unidades para Ecommerce', async () => {
    const f = await fixture({ quantity: 1.5 });
    const { reserveForOrder } = await import('@/modules/ecommerce/services/store-stock.service');
    const site = await prisma.webSite.create({ data: { companyId: f.companyId, name: 'Tienda con fracciones', slug: `pos-store-${run}-${fixtureIndex}` } });
    const order = await prisma.storeOrder.create({ data: {
      companyId: f.companyId, siteId: site.id, number: 1, accessToken: `access-${run}-${fixtureIndex}`,
      idempotencyKey: `order-${run}-${fixtureIndex}`, customerName: 'Cliente web', customerEmail: 'web@test.cl', customerPhone: '',
      deliveryMethod: 'PICKUP', subtotal: 1190, total: 1190, netAmount: 1000, ivaAmount: 190,
    } });
    await prisma.$transaction((tx) => reserveForOrder(tx, {
      companyId: f.companyId, warehouseId: f.warehouseId, orderId: order.id,
      lines: [{ productId: f.product1, name: 'Producto POS 1', quantity: 1 }], expiresAt: new Date(Date.now() + 60_000),
    }));
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 0 });
    expect((await pos.listPosProducts(f.companyId, f.warehouseId)).find((p) => p.id === f.product1)?.stock).toBe(0.5);
    const sale = await pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, {
      items: [{ productId: f.product1, quantity: 0.5 }], cashReceived: 1000,
    }));
    expect(sale).toMatchObject({ netAmount: 500, ivaAmount: 95, totalAmount: 595, changeDue: 405 });
    expect(await quantity(f)).toBe(1);
    expect((await pos.listPosProducts(f.companyId, f.warehouseId)).find((p) => p.id === f.product1)?.stock).toBe(0);
    await expect(pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, { items: [{ productId: f.product1, quantity: 0.5 }] }))).rejects.toThrow('Stock reservado');
    expect(await quantity(f)).toBe(1);
    expect((await cash.getShiftSummary(f.companyId, shift.id)).cashSales).toBe(595);
  });

  it('el POS respeta una reserva Ecommerce y vuelve a vender cuando se libera', async () => {
    const f = await fixture({ quantity: 1 });
    const { reserveForOrder, closeReservations } = await import('@/modules/ecommerce/services/store-stock.service');
    const site = await prisma.webSite.create({ data: { companyId: f.companyId, name: 'Tienda de prueba', slug: `pos-store-${run}-${fixtureIndex}` } });
    const order = await prisma.storeOrder.create({ data: {
      companyId: f.companyId, siteId: site.id, number: 1, accessToken: `access-${run}-${fixtureIndex}`,
      idempotencyKey: `order-${run}-${fixtureIndex}`, customerName: 'Cliente web', customerEmail: 'web@test.cl', customerPhone: '',
      deliveryMethod: 'PICKUP', subtotal: 1190, total: 1190, netAmount: 1000, ivaAmount: 190,
    } });
    await prisma.$transaction((tx) => reserveForOrder(tx, {
      companyId: f.companyId, warehouseId: f.warehouseId, orderId: order.id,
      lines: [{ productId: f.product1, name: 'Producto POS 1', quantity: 1 }], expiresAt: new Date(Date.now() + 60_000),
    }));
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 0 });
    expect((await pos.listPosProducts(f.companyId, f.warehouseId)).find((p) => p.id === f.product1)?.stock).toBe(0);
    await expect(pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f))).rejects.toThrow();
    expect(await quantity(f)).toBe(1);
    expect(await prisma.salesDocument.count({ where: { companyId: f.companyId } })).toBe(0);
    expect(await prisma.payment.count({ where: { companyId: f.companyId } })).toBe(0);
    await prisma.$transaction((tx) => closeReservations(tx, f.companyId, order.id, 'RELEASED'));
    const sale = await pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f));
    expect(sale.totalAmount).toBe(1190);
    expect(await quantity(f)).toBe(0);
  });

  it('checkout Ecommerce y POS no se adjudican simultáneamente la última unidad', async () => {
    const f = await fixture({ quantity: 1 });
    const { reserveForOrder } = await import('@/modules/ecommerce/services/store-stock.service');
    const site = await prisma.webSite.create({ data: { companyId: f.companyId, name: 'Tienda concurrente', slug: `pos-store-${run}-${fixtureIndex}` } });
    const order = await prisma.storeOrder.create({ data: {
      companyId: f.companyId, siteId: site.id, number: 1, accessToken: `access-${run}-${fixtureIndex}`,
      idempotencyKey: `order-${run}-${fixtureIndex}`, customerName: 'Cliente web', customerEmail: 'web@test.cl', customerPhone: '',
      deliveryMethod: 'PICKUP', subtotal: 1190, total: 1190, netAmount: 1000, ivaAmount: 190,
    } });
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 0 });
    const attempts = await Promise.allSettled([
      prisma.$transaction((tx) => reserveForOrder(tx, {
        companyId: f.companyId, warehouseId: f.warehouseId, orderId: order.id,
        lines: [{ productId: f.product1, name: 'Producto POS 1', quantity: 1 }], expiresAt: new Date(Date.now() + 60_000),
      })),
      pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f)),
    ]);
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const reserved = await prisma.storeStockReservation.count({ where: { companyId: f.companyId, status: 'ACTIVE' } });
    const sold = await prisma.salesDocument.count({ where: { companyId: f.companyId } });
    expect(reserved + sold).toBe(1);
    expect(await quantity(f)).toBe(1 - sold);
    expect(await prisma.payment.count({ where: { companyId: f.companyId } })).toBe(sold);
  });

  it('una empresa no puede consultar ni operar el turno, la caja o el producto de otra', async () => {
    const f = await fixture();
    const other = await fixture();
    const shift = await cash.openShift(f.companyId, f.user1, { cashRegisterId: f.register1, initialAmount: 1000 });
    expect(await cash.getShift(other.companyId, shift.id)).toBeNull();
    await expect(cash.getShiftSummary(other.companyId, shift.id)).rejects.toThrow();
    await expect(cash.registerCashMovement(other.companyId, shift.id, other.user1, { type: 'INFLOW', amount: 1000, reason: 'Ingreso ajeno' })).rejects.toThrow();
    await expect(cash.openShift(other.companyId, other.user1, { cashRegisterId: f.register1, initialAmount: 1000 })).rejects.toThrow();
    await expect(pos.createPosSale(f.companyId, f.user1, shift.id, saleInput(f, { items: [{ productId: other.product1, quantity: 1 }] }))).rejects.toThrow();
    expect(await prisma.payment.count({ where: { companyId: f.companyId } })).toBe(0);
    expect(await prisma.cashMovement.count({ where: { companyId: f.companyId } })).toBe(0);
  });
});

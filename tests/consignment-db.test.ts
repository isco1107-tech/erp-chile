/**
 * Consignación (sellers) contra una base PostgreSQL REAL: el recorrido completo, desde que llega la
 * mercadería del seller hasta que se le liquida y entra a su portal.
 *
 * No corre en `npm test` normal: necesita una base desechable. Para correrla:
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/consignment-db.test.ts
 *
 * La base debe tener las migraciones aplicadas (`prisma migrate deploy`). Por seguridad (la base del
 * `.env` del proyecto ES la de producción, ver CLAUDE.md §5) SE NIEGA a correr si el servidor no es
 * local o si el nombre de la base no termina en `_test`.
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

jest.mock('@/lib/auth/audit', () => ({ createAuditLog: jest.fn(async () => undefined) }));
// La venta avisa a las automatizaciones DESPUÉS de confirmar; aquí no hay nada que avisar.
jest.mock('@/lib/workflows/engine', () => ({ emitWorkflowEvent: jest.fn(async () => undefined) }));

describeDb('consignación contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let consignment: typeof import('@/modules/inventory/services/consignment.service');
  let settlements: typeof import('@/modules/inventory/services/consignment-settlement.service');
  let stockService: typeof import('@/modules/inventory/services/stock.service');
  let salesService: typeof import('@/modules/sales/services/sales.service');
  let contactsService: typeof import('@/modules/contacts/services/contacts.service');
  let productsService: typeof import('@/modules/inventory/services/products.service');
  let portal: typeof import('@/modules/inventory/services/supplier-portal.service');
  let portalExport: typeof import('@/modules/inventory/services/supplier-portal-export.service');

  const suffix = Math.random().toString(36).slice(2, 8);
  const ids = {
    companyA: '', companyB: '', companyC: '', user: '', whA: '', whC: '',
    seller1: '', seller2: '', sellerB: '', customer: '', customerC: '', sellerC: '',
    p1: '', p2: '', p3: '', p4: '', pC1: '', pC2: '',
  };

  const company = (n: number, name: string, features: Record<string, boolean> = {}) =>
    prisma.company.create({ data: { rut: `76${suffix}${n}-${n}`, businessName: name, features: { create: features } } });
  const contact = (companyId: string, razonSocial: string, n: number, data: Record<string, unknown>) =>
    prisma.contact.create({ data: { companyId, razonSocial, rut: `79.${suffix.slice(0, 3)}.00${n}-${n}`, rutClean: `79${suffix.slice(0, 3)}00${n}${n}`, ...data } });
  const product = (companyId: string, sku: string, name: string, data: Record<string, unknown> = {}) =>
    prisma.product.create({ data: { companyId, sku, name, netPrice: 10_000, grossPrice: 11_900, ...data } });

  const sale = (companyId: string, contactId: string, warehouseId: string, items: Array<{ productId: string; quantity: number; unitPrice: number }>, dteType: 'BOLETA_39' | 'FACTURA_33' = 'BOLETA_39') =>
    salesService.createSalesDocument(
      companyId,
      { contactId, warehouseId, dteType, paymentMethod: 'EFECTIVO', items: items.map((item) => ({ ...item, description: `Producto ${item.productId.slice(-4)}` })) },
      'ISSUED'
    );

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    consignment = await import('@/modules/inventory/services/consignment.service');
    settlements = await import('@/modules/inventory/services/consignment-settlement.service');
    stockService = await import('@/modules/inventory/services/stock.service');
    salesService = await import('@/modules/sales/services/sales.service');
    contactsService = await import('@/modules/contacts/services/contacts.service');
    productsService = await import('@/modules/inventory/services/products.service');
    portal = await import('@/modules/inventory/services/supplier-portal.service');
    portalExport = await import('@/modules/inventory/services/supplier-portal-export.service');

    ids.companyA = (await company(1, `Empresa Consignación A ${suffix}`)).id;
    ids.companyB = (await company(2, `Empresa Consignación B ${suffix}`)).id;
    ids.companyC = (await company(3, `Empresa Contable C ${suffix}`, { hasAccounting: true })).id;
    ids.whA = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Central', code: 'CEN', isDefault: true } })).id;
    ids.whC = (await prisma.warehouse.create({ data: { companyId: ids.companyC, name: 'Central', code: 'CEN', isDefault: true } })).id;
    ids.user = (await prisma.user.create({ data: { email: `admin-${suffix}@test.cl`, passwordHash: 'x', name: 'Admin', companyId: ids.companyA, role: 'ADMIN' } })).id;

    ids.seller1 = (await contact(ids.companyA, 'Cerámicas del Sur', 1, { isConsignor: true, isCustomer: false, consignmentCommissionBps: 2000 })).id;
    ids.seller2 = (await contact(ids.companyA, 'Telares Ñuble', 2, { isConsignor: true, isCustomer: false, consignmentCommissionBps: 1000 })).id;
    ids.customer = (await contact(ids.companyA, 'Cliente Secreto SpA', 3, { isCustomer: true })).id;
    ids.sellerB = (await contact(ids.companyB, 'Seller de la empresa B', 4, { isConsignor: true, isCustomer: false, consignmentCommissionBps: 500 })).id;
    ids.sellerC = (await contact(ids.companyC, 'Seller contable', 5, { isConsignor: true, isCustomer: false, consignmentCommissionBps: 2000 })).id;
    ids.customerC = (await contact(ids.companyC, 'Cliente contable', 6, { isCustomer: true })).id;

    ids.p1 = (await product(ids.companyA, 'P1', 'Taza de greda', { consignorId: ids.seller1 })).id; // comisión del seller: 20 %
    ids.p2 = (await product(ids.companyA, 'P2', 'Plato de greda', { consignorId: ids.seller1, consignmentCommissionBps: 1000 })).id; // la suya: 10 %
    ids.p3 = (await product(ids.companyA, 'P3', 'Producto propio de la tienda')).id;
    ids.p4 = (await product(ids.companyA, 'P4', 'Manta del otro seller', { consignorId: ids.seller2 })).id;
    ids.pC1 = (await product(ids.companyC, 'C1', 'Jarro del seller', { consignorId: ids.sellerC })).id;
    ids.pC2 = (await product(ids.companyC, 'C2', 'Producto propio contable')).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    // El libro es inmutable por triggers; igual que el borrado de empresa, se desactivan solo para limpiar.
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" DISABLE TRIGGER "trg_journal_entry_immutable"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" DISABLE TRIGGER "trg_journal_line_immutable"`);
    try {
      for (const companyId of [ids.companyA, ids.companyB, ids.companyC].filter(Boolean)) {
        await prisma.account.updateMany({ where: { companyId }, data: { parentId: null } });
        await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfId: null } });
        await prisma.accountMapping.deleteMany({ where: { companyId } });
        await prisma.journalLine.deleteMany({ where: { companyId } });
        await prisma.journalEntry.deleteMany({ where: { companyId } });
        await prisma.journalEntrySequence.deleteMany({ where: { companyId } });
        await prisma.account.deleteMany({ where: { companyId } });
        await prisma.accountingPeriod.deleteMany({ where: { companyId } });
        await prisma.payment.deleteMany({ where: { companyId } });
        await prisma.consignmentSettlementLine.deleteMany({ where: { companyId } });
        await prisma.consignmentSettlement.deleteMany({ where: { companyId } });
        await prisma.supplierPortalAccess.deleteMany({ where: { companyId } });
        await prisma.salesDocumentItem.deleteMany({ where: { companyId } });
        await prisma.salesDocument.deleteMany({ where: { companyId } });
        await prisma.folioSequence.deleteMany({ where: { companyId } });
        await prisma.inventoryLot.deleteMany({ where: { companyId } });
        await prisma.inventoryMovement.deleteMany({ where: { companyId } });
        await prisma.stock.deleteMany({ where: { companyId } });
        await prisma.internalDocumentSequence.deleteMany({ where: { companyId } });
        await prisma.product.deleteMany({ where: { companyId } });
        await prisma.contact.deleteMany({ where: { companyId } });
        await prisma.warehouse.deleteMany({ where: { companyId } });
        await prisma.user.deleteMany({ where: { companyId } });
        await prisma.company.delete({ where: { id: companyId } });
      }
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" ENABLE TRIGGER "trg_journal_entry_immutable"`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" ENABLE TRIGGER "trg_journal_line_immutable"`);
      await prisma.$disconnect();
    }
  });

  const stockOf = async (productId: string) => (await prisma.stock.aggregate({ where: { productId }, _sum: { quantity: true } }))._sum.quantity ?? 0;

  describe('mercadería del seller', () => {
    it('recibirla sube el stock sin costo, sin PMP y a nombre del seller', async () => {
      await consignment.receiveConsignedStock(ids.companyA, ids.user, { productId: ids.p1, warehouseId: ids.whA, quantity: 10 });
      await consignment.receiveConsignedStock(ids.companyA, ids.user, { productId: ids.p2, warehouseId: ids.whA, quantity: 5 });
      await consignment.receiveConsignedStock(ids.companyA, ids.user, { productId: ids.p4, warehouseId: ids.whA, quantity: 4, reference: 'Entrega 1' });

      expect(await stockOf(ids.p1)).toBe(10);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.p1 } })).costPricePMP).toBe(0);
      const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: ids.p4 } });
      expect(movement).toMatchObject({ type: 'PURCHASE_IN', quantity: 4, unitCost: 0, totalCost: 0, newPmp: 0, supplierId: ids.seller2, userId: ids.user, reference: 'Entrega 1' });
    });

    it('un producto propio entra a su valor y el de un seller nunca se compra', async () => {
      await stockService.registerStockIn(ids.companyA, { productId: ids.p3, warehouseId: ids.whA, type: 'PURCHASE_IN', quantity: 20, unitCost: 1000 });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.p3 } })).costPricePMP).toBe(1000);

      await expect(stockService.registerStockIn(ids.companyA, { productId: ids.p1, warehouseId: ids.whA, type: 'PURCHASE_IN', quantity: 3, unitCost: 500 })).rejects.toThrow('está en consignación');
      expect(await stockOf(ids.p1)).toBe(10);
      // Recibir en consignación un producto propio tampoco se puede.
      await expect(consignment.receiveConsignedStock(ids.companyA, ids.user, { productId: ids.p3, warehouseId: ids.whA, quantity: 1 })).rejects.toThrow('no es un producto de seller');
    });

    it('el dueño de un producto solo cambia con el stock en 0', async () => {
      await expect(productsService.updateProduct(ids.companyA, ids.p1, { consignorId: ids.seller2 })).rejects.toThrow('su stock debe estar en 0');
      await expect(productsService.updateProduct(ids.companyA, ids.p1, { consignorId: null })).rejects.toThrow('su stock debe estar en 0');
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.p1 } })).consignorId).toBe(ids.seller1);
    });

    it('el seller de otra empresa, o un contacto que no es seller, no se puede asignar', async () => {
      const sinStock = await product(ids.companyA, 'P5', 'Producto sin stock');
      await expect(productsService.updateProduct(ids.companyA, sinStock.id, { consignorId: ids.sellerB })).rejects.toThrow('no existe o no está marcado como seller');
      await expect(productsService.updateProduct(ids.companyA, sinStock.id, { consignorId: ids.customer })).rejects.toThrow('no existe o no está marcado como seller');
      expect((await prisma.product.findUniqueOrThrow({ where: { id: sinStock.id } })).consignorId).toBeNull();
      // Con el stock en 0 y un seller de la empresa, sí: pasa a ser del seller y queda con costo 0.
      await productsService.updateProduct(ids.companyA, sinStock.id, { consignorId: ids.seller2, consignmentCommissionBps: 1500 });
      expect(await prisma.product.findUniqueOrThrow({ where: { id: sinStock.id } })).toMatchObject({ consignorId: ids.seller2, consignmentCommissionBps: 1500, costPricePMP: 0 });
      // Y vuelve a ser propio.
      await productsService.updateProduct(ids.companyA, sinStock.id, { consignorId: null });
      expect(await prisma.product.findUniqueOrThrow({ where: { id: sinStock.id } })).toMatchObject({ consignorId: null, consignmentCommissionBps: null });
      await prisma.product.delete({ where: { id: sinStock.id } });
    });

    it('no se puede quitar la condición de seller ni eliminarlo con productos', async () => {
      await expect(contactsService.updateContact(ids.companyA, ids.seller1, { isConsignor: false })).rejects.toThrow('2 productos en consignación');
      await expect(contactsService.deleteContact(ids.companyA, ids.seller1)).rejects.toThrow('productos en consignación');
      expect((await prisma.contact.findUniqueOrThrow({ where: { id: ids.seller1 } })).isConsignor).toBe(true);
    });

    it('la existencia por seller solo trae los suyos', async () => {
      const groups = await consignment.listConsignedStock(ids.companyA);
      const s1 = groups.find((group) => group.consignorId === ids.seller1)!;
      expect(s1.products.map((row) => row.sku).sort()).toEqual(['P1', 'P2']);
      expect(s1.totalUnits).toBe(15);
      expect(s1.products.find((row) => row.sku === 'P1')!.commissionBps).toBe(2000);
      expect(s1.products.find((row) => row.sku === 'P2')!.commissionBps).toBe(1000);
      expect(groups.find((group) => group.consignorId === ids.seller2)!.products.map((row) => row.sku)).toEqual(['P4']);
      expect(groups.some((group) => group.consignorId === ids.sellerB)).toBe(false);
    });
  });

  describe('venta y liquidación', () => {
    let boleta: Awaited<ReturnType<typeof sale>>;
    let factura: Awaited<ReturnType<typeof sale>>;

    it('cada línea vendida guarda el dueño y la comisión de ese momento', async () => {
      boleta = await sale(ids.companyA, ids.customer, ids.whA, [{ productId: ids.p1, quantity: 2, unitPrice: 10_000 }]);
      factura = await sale(
        ids.companyA,
        ids.customer,
        ids.whA,
        [
          { productId: ids.p2, quantity: 1, unitPrice: 5000 },
          { productId: ids.p3, quantity: 1, unitPrice: 3000 },
        ],
        'FACTURA_33'
      );
      const byProduct = new Map([...boleta.items, ...factura.items].map((item) => [item.productId, item]));
      expect(byProduct.get(ids.p1)).toMatchObject({ consignorId: ids.seller1, consignorCommissionBps: 2000, unitCostPMP: 0 });
      expect(byProduct.get(ids.p2)).toMatchObject({ consignorId: ids.seller1, consignorCommissionBps: 1000, unitCostPMP: 0 });
      expect(byProduct.get(ids.p3)).toMatchObject({ consignorId: null, consignorCommissionBps: null, unitCostPMP: 1000 });
      expect(await stockOf(ids.p1)).toBe(8);
    });

    it('cambiar la comisión después no toca lo ya vendido', async () => {
      await prisma.contact.update({ where: { id: ids.seller1 }, data: { consignmentCommissionBps: 5000 } });
      const pending = await settlements.getPendingSettlement(ids.companyA, ids.seller1);
      expect(pending.lines).toHaveLength(2);
      const taza = pending.lines.find((line) => line.netAmount === 20_000)!;
      expect(taza).toMatchObject({ quantity: 2, netAmount: 20_000, commissionAmount: 4000, payoutAmount: 16_000 });
      expect(pending.totals).toMatchObject({ units: 3, netSales: 25_000, commissionAmount: 4500, linesPayout: 20_500, payoutAmount: 20_500 });
      await prisma.contact.update({ where: { id: ids.seller1 }, data: { consignmentCommissionBps: 2000 } });
    });

    it('el pendiente de un seller no incluye lo de otro ni lo de otra empresa', async () => {
      expect((await settlements.getPendingSettlement(ids.companyA, ids.seller2)).lines).toEqual([]);
      await expect(settlements.getPendingSettlement(ids.companyB, ids.seller1)).rejects.toThrow('Seller no encontrado');
      await expect(settlements.generateSettlement(ids.companyB, ids.user, { consignorId: ids.seller1, adjustmentAmount: 0 })).rejects.toThrow('Seller no encontrado');
      expect(await settlements.listSettlements(ids.companyB)).toEqual([]);
    });

    it('dos liquidaciones simultáneas dejan una sola', async () => {
      const results = await Promise.allSettled([
        settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller1, adjustmentAmount: 0 }),
        settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller1, adjustmentAmount: 0 }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      expect(String(rejected.reason)).toContain('No hay ventas pendientes');

      const all = await settlements.listSettlements(ids.companyA, { consignorId: ids.seller1 });
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ number: 1, status: 'CONFIRMED', units: 3, netSales: 25_000, commissionAmount: 4500, payoutAmount: 20_500 });
      const detail = (await settlements.getSettlement(ids.companyA, all[0]!.id))!;
      expect(detail.lines).toHaveLength(2);
      expect(await settlements.getSettlement(ids.companyB, all[0]!.id)).toBeNull();
    });

    it('anular la venta ya liquidada deja un ajuste negativo, y no se liquida mientras sea negativo', async () => {
      await salesService.cancelSalesDocument(ids.companyA, factura.id, 'Error de digitación');
      const pending = await settlements.getPendingSettlement(ids.companyA, ids.seller1);
      expect(pending.lines).toHaveLength(1);
      expect(pending.lines[0]).toMatchObject({ quantity: -1, netAmount: -5000, commissionAmount: -500, payoutAmount: -4500 });
      await expect(settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller1, adjustmentAmount: 0 })).rejects.toThrow('Las devoluciones superan lo vendido');
      expect(await settlements.listSettlements(ids.companyA, { consignorId: ids.seller1 })).toHaveLength(1); // no gastó un número
    });

    it('una venta nueva compensa el ajuste y la liquidación siguiente trae solo la diferencia', async () => {
      await sale(ids.companyA, ids.customer, ids.whA, [{ productId: ids.p1, quantity: 1, unitPrice: 10_000 }]);
      const settlement = await settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller1, adjustmentAmount: 0 });
      // 10.000 − 20 % = 8.000, menos el ajuste de 4.500 por la factura anulada.
      expect(settlement).toMatchObject({ number: 2, payoutAmount: 3500, units: 0 });
    });

    it('una nota de crédito resta con la foto de la venta original', async () => {
      await prisma.contact.update({ where: { id: ids.seller1 }, data: { consignmentCommissionBps: 5000 } }); // hoy rige otra comisión
      await salesService.createSalesDocument(
        ids.companyA,
        {
          contactId: ids.customer,
          warehouseId: ids.whA,
          dteType: 'NOTA_CREDITO_61',
          paymentMethod: 'EFECTIVO',
          referenceType: 'BOLETA_39',
          referenceFolio: boleta.folio!,
          // Se devuelve a un precio distinto del de la venta (12.000 vs 10.000): al seller se le revierte lo que se le acreditó por esa unidad.
          items: [{ productId: ids.p1, description: 'Devolución taza', quantity: 1, unitPrice: 12_000 }],
        },
        'ISSUED'
      );
      await prisma.contact.update({ where: { id: ids.seller1 }, data: { consignmentCommissionBps: 2000 } });
      const credit = await prisma.salesDocumentItem.findFirstOrThrow({ where: { companyId: ids.companyA, document: { dteType: 'NOTA_CREDITO_61' } } });
      expect(credit).toMatchObject({ consignorId: ids.seller1, consignorCommissionBps: 2000, subtotal: 12_000, consignorBaseNet: 10_000 });

      const pending = await settlements.getPendingSettlement(ids.companyA, ids.seller1);
      expect(pending.lines).toHaveLength(1);
      expect(pending.lines[0]).toMatchObject({ quantity: -1, netAmount: -10_000, commissionAmount: -2000, payoutAmount: -8000 });
    });

    it('un ajuste manual se suma a lo que se le debe, con su motivo', async () => {
      await sale(ids.companyA, ids.customer, ids.whA, [{ productId: ids.p1, quantity: 2, unitPrice: 10_000 }]);
      const settlement = await settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller1, adjustmentAmount: -1000, adjustmentNote: 'Descuento acordado' });
      // +16.000 de la venta nueva, −8.000 de la nota de crédito, −1.000 de ajuste.
      expect(settlement).toMatchObject({ number: 3, payoutAmount: 7000 });
      const row = await prisma.consignmentSettlement.findUniqueOrThrow({ where: { id: settlement.id } });
      expect(row).toMatchObject({ adjustmentAmount: -1000, adjustmentNote: 'Descuento acordado', createdById: ids.user, companyId: ids.companyA });
    });
  });

  describe('pago y anulación', () => {
    it('pagar una liquidación la marca pagada una sola vez y la deja sin anular', async () => {
      const [first] = await settlements.listSettlements(ids.companyA, { consignorId: ids.seller1, status: 'CONFIRMED' }).then((rows) => rows.filter((row) => row.number === 1));
      await settlements.markSettlementPaid(ids.companyA, { id: first!.id, paidAt: '2026-10-20', reference: 'Transferencia 123' });
      const paid = (await settlements.getSettlement(ids.companyA, first!.id))!;
      expect(paid).toMatchObject({ status: 'PAID', paymentReference: 'Transferencia 123' });
      expect(paid.paidAt!.toISOString()).toBe('2026-10-20T12:00:00.000Z');
      await expect(settlements.markSettlementPaid(ids.companyA, { id: first!.id, paidAt: '2026-10-21' })).rejects.toThrow('ya está pagada');
      await expect(settlements.voidSettlement(ids.companyA, { id: first!.id, reason: 'Me equivoqué' })).rejects.toThrow('no se puede anular');
      await expect(settlements.markSettlementPaid(ids.companyB, { id: first!.id, paidAt: '2026-10-21' })).rejects.toThrow('Liquidación no encontrada');
    });

    it('anular una sin pagar devuelve sus ventas a pendientes', async () => {
      const [third] = (await settlements.listSettlements(ids.companyA, { consignorId: ids.seller1 })).filter((row) => row.number === 3);
      expect(third!.status).toBe('CONFIRMED');
      await settlements.voidSettlement(ids.companyA, { id: third!.id, reason: 'Error de digitación' });
      const pending = await settlements.getPendingSettlement(ids.companyA, ids.seller1);
      // La venta de 2 tazas y la nota de crédito vuelven a estar pendientes.
      expect(pending.totals).toMatchObject({ units: 1, netSales: 10_000, linesPayout: 8000 });
      const overview = (await settlements.listSettlementOverview(ids.companyA)).find((row) => row.consignorId === ids.seller1)!;
      expect(overview).toMatchObject({ pendingPayout: 8000, unpaidCount: 1, unpaidPayout: 3500 }); // la N° 2 sigue por pagar
    });
  });

  describe('devolver mercadería al seller', () => {
    it('baja el stock sin venderlo y no es una venta', async () => {
      const before = await stockOf(ids.p4);
      await consignment.returnConsignedStock(ids.companyA, ids.user, { productId: ids.p4, warehouseId: ids.whA, quantity: 3 });
      expect(await stockOf(ids.p4)).toBe(before - 3);
      const movement = await prisma.inventoryMovement.findFirstOrThrow({ where: { productId: ids.p4, type: 'ADJUSTMENT_OUT' } });
      expect(movement).toMatchObject({ unitCost: 0, totalCost: 0, supplierId: ids.seller2, reference: 'Devolución al seller' });
      await expect(consignment.returnConsignedStock(ids.companyA, ids.user, { productId: ids.p4, warehouseId: ids.whA, quantity: 99 })).rejects.toThrow('Stock insuficiente');
      // Aunque la empresa venda con stock negativo, no se le puede devolver al seller lo que no está.
      await prisma.companySettings.upsert({ where: { companyId: ids.companyA }, create: { companyId: ids.companyA, allowNegativeStock: true }, update: { allowNegativeStock: true } });
      try {
        await expect(consignment.returnConsignedStock(ids.companyA, ids.user, { productId: ids.p4, warehouseId: ids.whA, quantity: 99 })).rejects.toThrow('Stock insuficiente');
        expect(await stockOf(ids.p4)).toBe(before - 3);
      } finally {
        await prisma.companySettings.update({ where: { companyId: ids.companyA }, data: { allowNegativeStock: false } });
      }
      expect((await settlements.getPendingSettlement(ids.companyA, ids.seller2)).lines).toEqual([]);
    });
  });

  describe('portal del seller', () => {
    let code = '';

    it('el seller puede tener código y el portal muestra solo lo suyo', async () => {
      code = (await portal.generateSupplierPortalCode(ids.companyA, ids.seller1, ids.user)).code;
      const admin = await portal.getSupplierPortalAdmin(ids.companyA, ids.seller1);
      expect(admin.isSupplier).toBe(false);
      expect(admin.consignment!.products.map((row) => row.sku).sort()).toEqual(['P1', 'P2']);

      const view = (await portal.getSupplierPortalView(code))!;
      expect(view.rows).toEqual([]); // no es proveedor
      const consignmentView = view.consignment!;
      expect(consignmentView.rows.map((row) => row.sku).sort()).toEqual(['P1', 'P2']);
      expect(consignmentView.commissionBps).toBe(2000);
      expect(consignmentView.rows.find((row) => row.sku === 'P2')!.commissionBps).toBe(1000);
      // Lo vendido sin liquidar y las liquidaciones vigentes (la N° 3 está anulada y no se muestra).
      expect(consignmentView.pending).toEqual({ units: 1, netSales: 10_000, commissionAmount: 2000, payoutAmount: 8000 });
      expect(consignmentView.settlements.map((settlement) => [settlement.number, settlement.status]).sort()).toEqual([[1, 'PAID'], [2, 'CONFIRMED']]);
    });

    it('lo vendido sale de SUS líneas de venta (netas de devoluciones) y las bajas no se le muestran', async () => {
      const rows = (await portal.getSupplierPortalView(code))!.consignment!.rows;
      const taza = rows.find((row) => row.sku === 'P1')!;
      // Tazas: boleta de 2, venta de 1 y venta de 2 (5), menos 1 devuelta por nota de crédito = 4.
      expect(taza.sold30).toBe(4);
      expect(taza.written30).toBeNull();
      expect(taza.coverageDays).toBe(Math.floor(taza.total / (4 / 30)));
      // El plato se vendió en una factura que se anuló: no cuenta.
      expect(rows.find((row) => row.sku === 'P2')!.sold30).toBe(0);
    });

    it('sin «mostrar lo que sale» el seller no ve ventas ni cobertura, pero sí sus liquidaciones', async () => {
      await portal.setSupplierPortalMovement(ids.companyA, ids.seller1, false);
      const view = (await portal.getSupplierPortalView(code))!.consignment!;
      expect(view.rows.every((row) => row.sold30 === null && row.coverageDays === null)).toBe(true);
      expect(view.settlements).toHaveLength(2);
      await portal.setSupplierPortalMovement(ids.companyA, ids.seller1, true);
    });

    it('un seller que no es proveedor no puede recibir productos «a mano» como proveedor', async () => {
      await expect(portal.linkSupplierProduct(ids.companyA, ids.seller1, ids.p3)).rejects.toThrow('proveedor');
      expect(await prisma.productSupplier.count({ where: { companyId: ids.companyA, supplierId: ids.seller1 } })).toBe(0);
    });

    it('jamás sale un cliente, un documento, un costo ni lo de otro seller', async () => {
      const text = JSON.stringify(await portal.getSupplierPortalView(code));
      for (const forbidden of ['Cliente Secreto', 'Telares', 'Manta del otro seller', 'P3', 'P4', 'costPricePMP', 'unitCost', 'companyId', 'passwordHash', ids.companyA, ids.seller1, ids.seller2, ids.customer, ids.p1, ids.user, 'folio', 'salesDocument']) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('el Excel trae la consignación y las liquidaciones, sin datos de clientes', async () => {
      const view = (await portal.getSupplierPortalView(code))!;
      const buffer = await portalExport.buildSupplierInventoryWorkbook(view);
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Consignación', 'Liquidaciones']);
      const cells = workbook.worksheets.flatMap((sheet) => sheet.getSheetValues().flat()).map(String).join('|');
      expect(cells).not.toContain('Cliente Secreto');
      expect(cells).toContain('Taza de greda');
    });

    it('una empresa sin el módulo de inventario no tiene portal', async () => {
      await prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasInventory: false } });
      expect(await portal.getSupplierPortalView(code)).toBeNull();
      await prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasInventory: true } });
      expect(await portal.getSupplierPortalView(code)).not.toBeNull();
    });

    it('un contacto que no es proveedor ni seller sigue sin portal', async () => {
      await expect(portal.generateSupplierPortalCode(ids.companyA, ids.customer, ids.user)).rejects.toThrow('proveedor');
      await expect(portal.generateSupplierPortalCode(ids.companyA, ids.sellerB, ids.user)).rejects.toThrow('proveedor'); // de otra empresa
    });
  });

  describe('el libro contable no se entera de la mercadería del seller', () => {
    it('Existencias refleja solo el stock propio; el seller no entra ni al costo de venta', async () => {
      const { ensureChartOfAccounts } = await import('@/modules/accounting/services/chart-setup.service');
      await ensureChartOfAccounts(ids.companyC);

      await consignment.receiveConsignedStock(ids.companyC, ids.user, { productId: ids.pC1, warehouseId: ids.whC, quantity: 10 });
      await stockService.registerStockIn(ids.companyC, { productId: ids.pC2, warehouseId: ids.whC, type: 'ADJUSTMENT_IN', quantity: 10, unitCost: 700 });
      await sale(ids.companyC, ids.customerC, ids.whC, [
        { productId: ids.pC1, quantity: 4, unitPrice: 10_000 },
        { productId: ids.pC2, quantity: 2, unitPrice: 2000 },
      ]);

      const mapping = await prisma.accountMapping.findMany({ where: { companyId: ids.companyC, key: { in: ['EXISTENCIAS', 'COSTO_VENTAS', 'PROVEEDORES'] } } });
      const accountOf = (key: string) => mapping.find((row) => row.key === key)!.accountId;
      const balance = async (accountId: string) => {
        const total = await prisma.journalLine.aggregate({ where: { companyId: ids.companyC, accountId }, _sum: { debit: true, credit: true } });
        return (total._sum.debit ?? 0) - (total._sum.credit ?? 0);
      };

      // Solo lo propio: 10 u × $700 entraron y 2 u × $700 salieron = 8 × 700. Lo del seller no suma nada.
      expect(await balance(accountOf('EXISTENCIAS'))).toBe(8 * 700);
      // El costo de venta es solo el del producto propio: 2 × $700.
      expect(await balance(accountOf('COSTO_VENTAS'))).toBe(2 * 700);
      // Y no se le debe nada a Proveedores por la mercadería recibida en consignación.
      expect(await balance(accountOf('PROVEEDORES'))).toBe(0);
      // El stock físico sí incluye la mercadería del seller.
      expect(await stockOf(ids.pC1)).toBe(6);
      // El valor de inventario (stock × PMP) coincide con el libro: lo del seller vale 0.
      const valued = await prisma.stock.findMany({ where: { companyId: ids.companyC }, include: { product: { select: { costPricePMP: true } } } });
      expect(Math.round(valued.reduce((sum, row) => sum + row.quantity * row.product.costPricePMP, 0))).toBe(8 * 700);
    });
  });

  describe('un producto que cambia de dueño no descuadra las devoluciones ni las anulaciones', () => {
    it('no se repone desde un documento anterior al cambio de dueño; se vuelve a poder al restituirlo', async () => {
      // Producto propio: entra a $1.000, se vende todo (stock 0) y pasa a un seller.
      const pOwn = await product(ids.companyA, 'P6', 'Producto que cambia de dueño');
      await stockService.registerStockIn(ids.companyA, { productId: pOwn.id, warehouseId: ids.whA, type: 'PURCHASE_IN', quantity: 3, unitCost: 1000 });
      const venta = await sale(ids.companyA, ids.customer, ids.whA, [{ productId: pOwn.id, quantity: 3, unitPrice: 5000 }]);
      expect(await stockOf(pOwn.id)).toBe(0);
      await productsService.updateProduct(ids.companyA, pOwn.id, { consignorId: ids.seller2 });

      const creditNote = () =>
        salesService.createSalesDocument(
          ids.companyA,
          { contactId: ids.customer, warehouseId: ids.whA, dteType: 'NOTA_CREDITO_61', paymentMethod: 'EFECTIVO', referenceType: 'BOLETA_39', referenceFolio: venta.folio!, items: [{ productId: pOwn.id, description: 'Devolución', quantity: 1, unitPrice: 5000 }] },
          'ISSUED'
        );
      await expect(creditNote()).rejects.toThrow('el producto cambió de dueño');
      await expect(salesService.cancelSalesDocument(ids.companyA, venta.id, 'Error')).rejects.toThrow('el producto cambió de dueño');
      expect(await stockOf(pOwn.id)).toBe(0);
      expect((await prisma.salesDocument.findUniqueOrThrow({ where: { id: venta.id } })).status).toBe('ISSUED');

      // Con el mismo dueño de la venta (vuelve a ser propio), la anulación repone al costo original.
      await productsService.updateProduct(ids.companyA, pOwn.id, { consignorId: null });
      await salesService.cancelSalesDocument(ids.companyA, venta.id, 'Error');
      expect(await stockOf(pOwn.id)).toBe(3);
    });
  });

  describe('lo que se le debe a un seller no desaparece con su ficha', () => {
    it('no se elimina ni se desmarca con ventas sin liquidar, y la historia lo retiene', async () => {
      const seller3 = (await contact(ids.companyA, 'Seller de paso', 7, { isConsignor: true, isCustomer: false, consignmentCommissionBps: 2500 })).id;
      const p7 = (await product(ids.companyA, 'P7', 'Producto de paso', { consignorId: seller3 })).id;
      await consignment.receiveConsignedStock(ids.companyA, ids.user, { productId: p7, warehouseId: ids.whA, quantity: 1 });
      await sale(ids.companyA, ids.customer, ids.whA, [{ productId: p7, quantity: 1, unitPrice: 4000 }]);
      // Stock en 0: el producto se puede pasar a propio, y el seller queda sin productos.
      await productsService.updateProduct(ids.companyA, p7, { consignorId: null });

      await expect(contactsService.updateContact(ids.companyA, seller3, { isConsignor: false })).rejects.toThrow('ventas sin liquidar o liquidaciones sin pagar');
      await expect(contactsService.deleteContact(ids.companyA, seller3)).rejects.toThrow('ventas de su mercadería');
      expect((await prisma.contact.findUniqueOrThrow({ where: { id: seller3 } })).isConsignor).toBe(true);

      // Se liquida (3.000 = 4.000 − 25 %) pero sin pagar: sigue sin poder desmarcarse.
      const settlement = await settlements.generateSettlement(ids.companyA, ids.user, { consignorId: seller3, adjustmentAmount: 0 });
      expect(settlement.payoutAmount).toBe(3000);
      await expect(contactsService.updateContact(ids.companyA, seller3, { isConsignor: false })).rejects.toThrow('ventas sin liquidar o liquidaciones sin pagar');

      // Ya pagado y sin nada pendiente, la condición de seller se puede quitar; eliminarlo sigue sin poder: tiene historia.
      await settlements.markSettlementPaid(ids.companyA, { id: settlement.id, paidAt: new Date().toISOString().slice(0, 10) });
      await contactsService.updateContact(ids.companyA, seller3, { isConsignor: false });
      expect((await prisma.contact.findUniqueOrThrow({ where: { id: seller3 } })).isConsignor).toBe(false);
      await expect(contactsService.deleteContact(ids.companyA, seller3)).rejects.toThrow('liquidaciones');
    });

    it('un reintento con la misma clave devuelve la misma liquidación, también con solo un ajuste', async () => {
      const key = `intento-${suffix}-1`;
      const first = await settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller2, adjustmentAmount: 5000, adjustmentNote: 'Bonificación acordada', idempotencyKey: key });
      const second = await settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller2, adjustmentAmount: 5000, adjustmentNote: 'Bonificación acordada', idempotencyKey: key });
      expect(second.id).toBe(first.id);
      expect((await settlements.listSettlements(ids.companyA, { consignorId: ids.seller2 })).filter((row) => row.payoutAmount === 5000)).toHaveLength(1);
      // Con una clave distinta es otra liquidación.
      const third = await settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller2, adjustmentAmount: 5000, adjustmentNote: 'Bonificación acordada', idempotencyKey: `${key}-b` });
      expect(third.id).not.toBe(first.id);
    });

    it('una vista previa vieja no liquida un monto distinto del que la persona confirmó', async () => {
      await sale(ids.companyA, ids.customer, ids.whA, [{ productId: ids.p2, quantity: 1, unitPrice: 5000 }]);
      const seller = await settlements.getPendingSettlement(ids.companyA, ids.seller1);
      const shown = seller.totals.payoutAmount;
      await sale(ids.companyA, ids.customer, ids.whA, [{ productId: ids.p2, quantity: 1, unitPrice: 5000 }]); // entra otra venta mientras tanto
      await expect(settlements.generateSettlement(ids.companyA, ids.user, { consignorId: ids.seller1, adjustmentAmount: 0, expectedPayoutAmount: shown })).rejects.toThrow('Las ventas cambiaron');
    });
  });
});

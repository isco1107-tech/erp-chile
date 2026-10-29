/**
 * «Exportar datos» contra PostgreSQL real: los filtros, los totales (con las notas de crédito
 * restando), el aislamiento entre empresas y el contenido del Excel. Solo se habilita sobre una
 * base LOCAL desechable terminada en `_test`; nunca usa la DATABASE_URL del .env (producción).
 *
 * WAREHOUSE_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/erp_pos_test \
 *   npx jest tests/exports-db.test.ts --runInBand
 */
import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';

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

jest.setTimeout(120_000);

const ALL_BOLETAS = { group: 'BOLETAS', status: 'ISSUED' } as const;

async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

describeDb('Exportar datos contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let sales: typeof import('@/modules/exports/services/sales-export.service');
  let moves: typeof import('@/modules/exports/services/movements-export.service');
  let stock: typeof import('@/modules/inventory/services/stock.service');
  let reset: typeof import('@/lib/company-erasure/core');
  const companyIds: string[] = [];
  const run = Math.random().toString(36).slice(2, 10);
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    sales = await import('@/modules/exports/services/sales-export.service');
    moves = await import('@/modules/exports/services/movements-export.service');
    stock = await import('@/modules/inventory/services/stock.service');
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

  /** Dos bodegas, un producto en cada una, y documentos de todos los tipos y estados. */
  async function fixture() {
    const key = `${run}-${++counter}`;
    const company = await prisma.company.create({
      data: { rut: `exp-${key}`, businessName: `Exportar ${key}`, features: { create: { hasPos: true, hasInventory: true } }, settings: { create: {} } },
    });
    companyIds.push(company.id);
    const companyId = company.id;
    const user = await prisma.user.create({ data: { companyId, email: `exp-${key}@test.cl`, name: 'Cajera Ana', role: 'SALES', passwordHash: 'x' } });
    const w1 = await prisma.warehouse.create({ data: { companyId, name: 'Local Centro', code: 'C', isDefault: true } });
    const w2 = await prisma.warehouse.create({ data: { companyId, name: 'Bodega Norte', code: 'N' } });
    const customer = await prisma.contact.create({ data: { companyId, rut: '12.345.678-5', rutClean: '123456785', razonSocial: 'Ana Soto', isCustomer: true } });
    const injected = await prisma.contact.create({ data: { companyId, rut: '9.999.999-3', rutClean: '99999993', razonSocial: '=HYPERLINK("http://x")', isCustomer: true } });
    const product = await prisma.product.create({ data: { companyId, sku: `EXP-${key}`, name: 'Leche entera 1L', netPrice: 1000, grossPrice: 1190, isTrackable: true } });
    await stock.registerStockIn(companyId, { productId: product.id, warehouseId: w1.id, type: 'PURCHASE_IN', quantity: 10, unitCost: 400, userId: user.id });
    await stock.registerStockIn(companyId, { productId: product.id, warehouseId: w2.id, type: 'ADJUSTMENT_IN', quantity: 5, unitCost: 400, userId: user.id });
    await stock.registerStockOut(companyId, { productId: product.id, warehouseId: w1.id, type: 'ADJUSTMENT_OUT', quantity: 2, userId: user.id, reasonCode: 'EXPIRED' });

    let folio = 100;
    const doc = async (overrides: {
      dteType: 'BOLETA_39' | 'BOLETA_EXENTA_41' | 'FACTURA_33' | 'NOTA_CREDITO_61' | 'COTIZACION';
      status?: 'ISSUED' | 'CANCELLED' | 'DRAFT';
      issueDate: string;
      total: number;
      warehouseId?: string;
      contactId?: string;
      paymentMethod?: string;
      description?: string;
    }) => {
      const net = Math.round(overrides.total / 1.19);
      return prisma.salesDocument.create({
        data: {
          companyId,
          contactId: overrides.contactId ?? customer.id,
          warehouseId: overrides.warehouseId ?? w1.id,
          dteType: overrides.dteType,
          folio: ++folio,
          status: overrides.status ?? 'ISSUED',
          issueDate: new Date(overrides.issueDate),
          paymentMethod: overrides.paymentMethod ?? 'EFECTIVO',
          netAmount: net,
          ivaAmount: overrides.total - net,
          totalAmount: overrides.total,
          sellerId: user.id,
          items: { create: [{ companyId, productId: product.id, sku: product.sku, description: overrides.description ?? 'Leche entera 1L', quantity: 1, unitPrice: net, subtotal: net, iva: overrides.total - net, total: overrides.total }] },
        },
      });
    };
    // Hora de Chile (UTC-3 en octubre de 2026): 00:30 del 1 de octubre y 23:30 del 30 de septiembre.
    const sep30Night = await doc({ dteType: 'BOLETA_39', issueDate: '2026-10-01T02:30:00Z', total: 1190 });
    const oct1Early = await doc({ dteType: 'BOLETA_39', issueDate: '2026-10-01T03:30:00Z', total: 2380, paymentMethod: 'TARJETA_DEBITO' });
    const oct10 = await doc({ dteType: 'BOLETA_39', issueDate: '2026-10-10T15:00:00Z', total: 5950, warehouseId: w2.id, paymentMethod: 'TRANSFERENCIA' });
    const exempt = await doc({ dteType: 'BOLETA_EXENTA_41', issueDate: '2026-10-12T15:00:00Z', total: 1000 });
    const cancelled = await doc({ dteType: 'BOLETA_39', status: 'CANCELLED', issueDate: '2026-10-11T15:00:00Z', total: 9999 });
    const invoice = await doc({ dteType: 'FACTURA_33', issueDate: '2026-10-13T15:00:00Z', total: 11_900, paymentMethod: 'CREDITO_30', contactId: injected.id, description: '+Servicio de despacho' });
    const credit = await doc({ dteType: 'NOTA_CREDITO_61', issueDate: '2026-10-14T15:00:00Z', total: 1190 });
    await doc({ dteType: 'BOLETA_39', status: 'DRAFT', issueDate: '2026-10-15T15:00:00Z', total: 777 });
    await doc({ dteType: 'COTIZACION', issueDate: '2026-10-15T15:00:00Z', total: 888 });
    return { companyId, user, w1, w2, customer, injected, product, docs: { sep30Night, oct1Early, oct10, exempt, cancelled, invoice, credit } };
  }

  it('boletas: solo emitidas, sin borradores ni cotizaciones, con los días en hora de Chile', async () => {
    const f = await fixture();
    const october = { ...ALL_BOLETAS, from: '2026-10-01', to: '2026-10-31' } as const;
    const { rows, total } = await sales.listSalesDocuments(f.companyId, october, 1);
    // La boleta de las 23:30 del 30 de septiembre NO es de octubre aunque en UTC ya sea 1 de octubre.
    expect(rows.map((row) => row.id).sort()).toEqual([f.docs.oct1Early.id, f.docs.oct10.id, f.docs.exempt.id].sort());
    expect(total).toBe(3);
    // La más reciente primero.
    expect(rows[0].id).toBe(f.docs.exempt.id);
    const september = await sales.listSalesDocuments(f.companyId, { ...ALL_BOLETAS, from: '2026-09-30', to: '2026-09-30' }, 1);
    expect(september.rows.map((row) => row.id)).toEqual([f.docs.sep30Night.id]);
  });

  it('estado y tipo: anuladas aparte, y las facturas y notas en su grupo', async () => {
    const f = await fixture();
    const range = { from: '2026-10-01', to: '2026-10-31' };
    expect((await sales.listSalesDocuments(f.companyId, { ...range, group: 'BOLETAS', status: 'CANCELLED' }, 1)).rows.map((row) => row.id)).toEqual([f.docs.cancelled.id]);
    expect((await sales.listSalesDocuments(f.companyId, { ...range, group: 'BOLETAS', status: 'BOTH' }, 1)).total).toBe(4);
    expect((await sales.listSalesDocuments(f.companyId, { ...range, group: 'FACTURAS', status: 'ISSUED' }, 1)).rows.map((row) => row.id)).toEqual([f.docs.invoice.id]);
    expect((await sales.listSalesDocuments(f.companyId, { ...range, group: 'NOTAS', status: 'ISSUED' }, 1)).rows.map((row) => row.id)).toEqual([f.docs.credit.id]);
    // «Todos» son los documentos de venta reales de octubre: 3 boletas emitidas, 1 anulada, la factura y la
    // nota de crédito. Ni la boleta del 30 de septiembre, ni el borrador, ni la cotización.
    const all = await sales.listSalesDocuments(f.companyId, { ...range, group: 'ALL', status: 'BOTH' }, 1);
    expect(all.total).toBe(6);
  });

  it('búsqueda por folio, nombre y RUT; «Karla» no se vuelve un RUT', async () => {
    const f = await fixture();
    const base = { group: 'ALL', status: 'BOTH' } as const;
    expect((await sales.listSalesDocuments(f.companyId, { ...base, q: String(f.docs.invoice.folio) }, 1)).rows.map((row) => row.id)).toEqual([f.docs.invoice.id]);
    expect((await sales.listSalesDocuments(f.companyId, { ...base, q: 'ana sot' }, 1)).total).toBe(6);
    expect((await sales.listSalesDocuments(f.companyId, { ...base, q: '12.345.678-5' }, 1)).total).toBe(6);
    expect((await sales.listSalesDocuments(f.companyId, { ...base, q: '9999999' }, 1)).rows.map((row) => row.id)).toEqual([f.docs.invoice.id]);
    expect((await sales.listSalesDocuments(f.companyId, { ...base, q: 'Karla' }, 1)).total).toBe(0);
  });

  it('bodega: solo los documentos de esa bodega', async () => {
    const f = await fixture();
    const { rows } = await sales.listSalesDocuments(f.companyId, { ...ALL_BOLETAS, warehouseId: f.w2.id }, 1);
    expect(rows.map((row) => row.id)).toEqual([f.docs.oct10.id]);
    expect(rows[0].warehouse).toBe('Bodega Norte');
  });

  it('el total vendido suma lo emitido y resta las notas de crédito; lo anulado va aparte', async () => {
    const f = await fixture();
    const summary = await sales.summarizeSales(f.companyId, { group: 'ALL', status: 'BOTH', from: '2026-10-01', to: '2026-10-31' });
    // 2.380 + 5.950 + 1.000 + 11.900 − 1.190 (nota de crédito)
    expect(summary.issued.total).toBe(2380 + 5950 + 1000 + 11_900 - 1190);
    expect(summary.issuedDocuments).toBe(5);
    expect(summary.cancelledDocuments).toBe(1);
    expect(summary.documents).toBe(6);
    const byType = Object.fromEntries(summary.byType.map((line) => [line.label, line]));
    expect(byType['Nota de Crédito Electrónica'].total).toBe(-1190);
    expect(byType['Boleta Electrónica'].documents).toBe(2);
    const byPayment = Object.fromEntries(summary.byPayment.map((line) => [line.label, line.total]));
    expect(byPayment['Crédito (a plazo)']).toBe(11_900);
    expect(byPayment['Transferencia']).toBe(5950);
    expect(byPayment['Tarjeta de Débito']).toBe(2380);
  });

  it('el Excel de boletas trae documentos, detalle por producto y resumen', async () => {
    const f = await fixture();
    const filter = { group: 'ALL', status: 'ISSUED', from: '2026-10-01', to: '2026-10-31' } as const;
    const book = await sales.buildSalesWorkbook(f.companyId, filter, { from: filter.from, to: filter.to });
    expect(book).toMatchObject({ documents: 5, lines: 5, truncated: false });
    const wb = await readWorkbook(book.buffer);
    expect(wb.worksheets.map((sheet) => sheet.name)).toEqual(['Documentos', 'Detalle de productos', 'Resumen']);
    const docs = wb.getWorksheet('Documentos')!;
    expect(docs.rowCount).toBe(6);
    const header = (docs.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(expect.arrayContaining(['Fecha y hora', 'Tipo', 'Folio', 'Cliente', 'RUT', 'Medio de pago', 'Total']));
    const col = (name: string) => (header as string[]).indexOf(name) + 1;
    // La hora que ve el cajero (Chile), no la de UTC: 00:30 del 1 de octubre.
    const dates = Array.from({ length: 5 }, (_, i) => docs.getRow(i + 2).getCell(col('Fecha y hora')).value as Date);
    expect(dates.some((d) => d.toISOString() === '2026-10-01T00:30:00.000Z')).toBe(true);
    // Lo que escribió un cliente no se interpreta como fórmula.
    const customers = Array.from({ length: 5 }, (_, i) => String(docs.getRow(i + 2).getCell(col('Cliente')).value));
    expect(customers).toContain(`'=HYPERLINK("http://x")`);
    const lines = wb.getWorksheet('Detalle de productos')!;
    expect(lines.rowCount).toBe(6);
    const lineDescriptions = Array.from({ length: 5 }, (_, i) => String(lines.getRow(i + 2).getCell(7).value));
    expect(lineDescriptions).toContain(`'+Servicio de despacho`);
    expect(wb.getWorksheet('Documentos')!.autoFilter).toBeTruthy();
  });

  it('un Excel sin filas no se rompe', async () => {
    const f = await fixture();
    const book = await sales.buildSalesWorkbook(f.companyId, { group: 'GUIAS', status: 'ISSUED' }, {});
    expect(book).toMatchObject({ documents: 0, lines: 0, truncated: false });
    const wb = await readWorkbook(book.buffer);
    expect(wb.getWorksheet('Documentos')!.rowCount).toBe(1);
  });

  it('nunca mezcla empresas', async () => {
    const a = await fixture();
    const b = await fixture();
    const filter = { group: 'ALL', status: 'BOTH', from: '2026-09-01', to: '2026-12-31' } as const;
    const listA = await sales.listSalesDocuments(a.companyId, filter, 1);
    const listB = await sales.listSalesDocuments(b.companyId, filter, 1);
    expect(listA.total).toBe(listB.total);
    expect(new Set(listA.rows.map((row) => row.id)).size).toBe(listA.rows.length);
    expect(listA.rows.some((row) => listB.rows.some((other) => other.id === row.id))).toBe(false);
    // Una bodega de otra empresa no devuelve nada.
    expect((await sales.listSalesDocuments(a.companyId, { ...filter, warehouseId: b.w1.id }, 1)).total).toBe(0);
    expect((await moves.listMovements(a.companyId, { kind: 'ALL', warehouseId: b.w1.id }, 1, { includeCosts: true })).total).toBe(0);
  });

  it('paginación de a 50', async () => {
    const f = await fixture();
    const filter = { group: 'ALL', status: 'BOTH' } as const;
    const first = await sales.listSalesDocuments(f.companyId, filter, 1);
    const beyond = await sales.listSalesDocuments(f.companyId, filter, 3);
    expect(first.rows.length).toBe(Math.min(first.total, sales.SALES_PAGE_SIZE));
    expect(beyond.rows).toEqual([]);
    expect(beyond.total).toBe(first.total);
  });

  describe('movimientos de inventario', () => {
    it('trae todas las bodegas con la suya en cada fila, y el stock de ESE producto en ESA bodega', async () => {
      const f = await fixture();
      const { rows, total } = await moves.listMovements(f.companyId, { kind: 'ALL' }, 1, { includeCosts: true });
      expect(total).toBe(3);
      const byType = Object.fromEntries(rows.map((row) => [row.type, row]));
      expect(byType.PURCHASE_IN).toMatchObject({ warehouse: 'Local Centro', direction: 'in', after: 10 });
      expect(byType.ADJUSTMENT_IN).toMatchObject({ warehouse: 'Bodega Norte', direction: 'in', after: 5 });
      expect(byType.ADJUSTMENT_OUT).toMatchObject({ warehouse: 'Local Centro', direction: 'out', before: 10, after: 8, operator: 'Cajera Ana' });
      expect(byType.ADJUSTMENT_OUT.reason).toBeTruthy();
    });

    it('filtra por bodega, tipo y producto', async () => {
      const f = await fixture();
      expect((await moves.listMovements(f.companyId, { kind: 'ALL', warehouseId: f.w2.id }, 1, { includeCosts: false })).total).toBe(1);
      expect((await moves.listMovements(f.companyId, { kind: 'OUTFLOWS' }, 1, { includeCosts: false })).rows.map((row) => row.type)).toEqual(['ADJUSTMENT_OUT']);
      expect((await moves.listMovements(f.companyId, { kind: 'ARRIVALS' }, 1, { includeCosts: false })).total).toBe(1);
      expect((await moves.listMovements(f.companyId, { kind: 'ALL', q: 'leche' }, 1, { includeCosts: false })).total).toBe(3);
      expect((await moves.listMovements(f.companyId, { kind: 'ALL', q: 'zapatos' }, 1, { includeCosts: false })).total).toBe(0);
    });

    it('el costo solo viaja a quien puede verlo', async () => {
      const f = await fixture();
      const withCosts = await moves.listMovements(f.companyId, { kind: 'ALL' }, 1, { includeCosts: true });
      const without = await moves.listMovements(f.companyId, { kind: 'ALL' }, 1, { includeCosts: false });
      expect(withCosts.rows.some((row) => (row.totalCost ?? 0) > 0)).toBe(true);
      expect(without.rows.every((row) => row.totalCost === null)).toBe(true);
    });

    it('el rango de fechas respeta el día de Chile', async () => {
      const f = await fixture();
      const day = await prisma.inventoryMovement.findFirstOrThrow({ where: { companyId: f.companyId, type: 'PURCHASE_IN' } });
      // Una llegada a las 23:30 del 30 de septiembre en Chile (02:30 UTC del día 1).
      await prisma.inventoryMovement.update({ where: { id: day.id }, data: { createdAt: new Date('2026-10-01T02:30:00Z') } });
      expect((await moves.listMovements(f.companyId, { kind: 'ARRIVALS', from: '2026-10-01', to: '2026-10-31' }, 1, { includeCosts: false })).total).toBe(0);
      expect((await moves.listMovements(f.companyId, { kind: 'ARRIVALS', from: '2026-09-30', to: '2026-09-30' }, 1, { includeCosts: false })).total).toBe(1);
    });

    it('el resumen cuenta por tipo y por bodega del filtro completo', async () => {
      const f = await fixture();
      const summary = await moves.summarizeMovements(f.companyId, { kind: 'ALL' });
      expect(summary.total).toBe(3);
      expect(Object.fromEntries(summary.byType.map((row) => [row.type, row.movements]))).toEqual({ PURCHASE_IN: 1, ADJUSTMENT_IN: 1, ADJUSTMENT_OUT: 1 });
      expect(Object.fromEntries(summary.byWarehouse.map((row) => [row.name, row.movements]))).toEqual({ 'Local Centro': 2, 'Bodega Norte': 1 });
    });

    it('el Excel trae una fila por movimiento, con o sin costo según el permiso', async () => {
      const f = await fixture();
      const withCosts = await moves.buildMovementsWorkbook(f.companyId, { kind: 'ALL' }, {}, { includeCosts: true });
      const without = await moves.buildMovementsWorkbook(f.companyId, { kind: 'ALL', warehouseId: f.w1.id }, {}, { includeCosts: false, warehouseName: 'Local Centro' });
      expect(withCosts).toMatchObject({ rows: 3, truncated: false });
      expect(without).toMatchObject({ rows: 2, truncated: false });
      const headerOf = async (book: { buffer: Buffer }) => ((await readWorkbook(book.buffer)).getWorksheet('Movimientos')!.getRow(1).values as unknown[]).slice(1) as string[];
      expect(await headerOf(withCosts)).toContain('Costo total');
      expect(await headerOf(without)).not.toContain('Costo total');
      const wb = await readWorkbook(without.buffer);
      const sheet = wb.getWorksheet('Movimientos')!;
      expect(sheet.rowCount).toBe(3);
      // Las salidas van en negativo para que el Excel sume bien.
      const quantities = [2, 3].map((row) => sheet.getRow(row).getCell(6).value);
      expect(quantities.sort()).toEqual([-2, 10]);
      expect(wb.getWorksheet('Resumen')).toBeTruthy();
    });
  });
});

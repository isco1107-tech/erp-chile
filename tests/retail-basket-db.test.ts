/**
 * Canasta cruzada contra una base PostgreSQL REAL: los pares por boleta se
 * cuentan con SQL.
 *
 *   RETAIL_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/retail-basket-db.test.ts
 *
 * Se niega a correr si el servidor no es local o si la base no termina en
 * `_test` (la base del `.env` del proyecto ES la de producción, CLAUDE.md §5).
 */
import type { DocumentStatus, DteType, PrismaClient } from '@prisma/client';

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

describeDb('Canasta cruzada contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let getBasket: typeof import('@/modules/retail/services/basket.service').getBasket;

  const suffix = Math.random().toString(36).slice(2, 8);
  const now = new Date();
  let companyA = '';
  let companyB = '';
  let w1 = '';
  let w2 = '';
  let wB = '';
  let customerA = '';
  let customerB = '';
  const p: Record<string, string> = {};
  let folio = 1;

  async function ticket(companyId: string, contactId: string, warehouseId: string, productIds: string[], extra: { status?: DocumentStatus; dteType?: DteType; daysAgo?: number } = {}) {
    await prisma.salesDocument.create({
      data: {
        companyId,
        contactId,
        warehouseId,
        dteType: extra.dteType ?? 'BOLETA_39',
        folio: folio++,
        status: extra.status ?? 'ISSUED',
        issueDate: new Date(now.getTime() - (extra.daysAgo ?? 2) * 86_400_000),
        paymentMethod: 'EFECTIVO',
        netAmount: 1000 * productIds.length,
        totalAmount: 1000 * productIds.length,
        // Dos líneas del mismo producto en una boleta cuentan una vez.
        items: { create: productIds.map((productId) => ({ companyId, productId, description: 'Línea', quantity: 1, unitPrice: 1000, subtotal: 1000, iva: 0, total: 1000 })) },
      },
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    ({ getBasket } = await import('@/modules/retail/services/basket.service'));

    companyA = (await prisma.company.create({ data: { rut: `79${suffix}1-1`, businessName: `Canasta A ${suffix}` } })).id;
    companyB = (await prisma.company.create({ data: { rut: `79${suffix}2-2`, businessName: `Canasta B ${suffix}` } })).id;
    w1 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Sala', code: 'SALA', isDefault: true } })).id;
    w2 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Otra', code: 'OTRA' } })).id;
    wB = (await prisma.warehouse.create({ data: { companyId: companyB, name: 'Central B', code: 'CEN', isDefault: true } })).id;
    const contact = (companyId: string) => prisma.contact.create({ data: { companyId, razonSocial: 'Consumidor final', rut: '66.666.666-6', rutClean: '666666666', isCustomer: true } }).then((c) => c.id);
    customerA = await contact(companyA);
    customerB = await contact(companyB);
    const supplier = (name: string, rut: string) => prisma.contact.create({ data: { companyId: companyA, razonSocial: name, rut, rutClean: rut.replace(/[.-]/g, ''), isSupplier: true } }).then((c) => c.id);
    const apicola = await supplier('Apícola del Sur', '76.100.100-1');
    const queseria = await supplier('Quesería del Valle', '76.200.200-2');
    for (const key of ['miel', 'queso', 'pan', 'cafe', 'otroLado']) {
      p[key] = (await prisma.product.create({ data: { companyId: companyA, sku: `${key}-${suffix}`, name: key, netPrice: 1000, grossPrice: 1190 } })).id;
    }
    p.ajeno = (await prisma.product.create({ data: { companyId: companyB, sku: `miel-${suffix}`, name: 'miel ajena', netPrice: 1000, grossPrice: 1190 } })).id;
    await prisma.productSupplier.createMany({ data: [
      { companyId: companyA, productId: p.miel!, supplierId: apicola },
      { companyId: companyA, productId: p.queso!, supplierId: queseria },
      { companyId: companyA, productId: p.pan!, supplierId: queseria },
    ] });

    // 20 boletas: miel+queso en 6 (y miel repetida en una), pan en 10, café solo en 4.
    for (let i = 0; i < 6; i += 1) await ticket(companyA, customerA, w1, i === 0 ? [p.miel!, p.queso!, p.miel!] : [p.miel!, p.queso!]);
    for (let i = 0; i < 10; i += 1) await ticket(companyA, customerA, w1, [p.pan!]);
    for (let i = 0; i < 4; i += 1) await ticket(companyA, customerA, w1, [p.cafe!]);
    // No cuentan: anuladas, notas de crédito, fuera del período, otra bodega, otra empresa y una compra mayorista.
    for (let i = 0; i < 6; i += 1) {
      await ticket(companyA, customerA, w1, [p.pan!, p.cafe!], { status: 'CANCELLED' });
      await ticket(companyA, customerA, w1, [p.pan!, p.cafe!], { dteType: 'NOTA_CREDITO_61' });
      await ticket(companyA, customerA, w1, [p.pan!, p.cafe!], { daysAgo: 45 });
      await ticket(companyA, customerA, w2, [p.pan!, p.otroLado!]);
      await ticket(companyB, customerB, wB, [p.ajeno!]);
    }
    const bulk = await Promise.all(Array.from({ length: 41 }, (_, i) => prisma.product.create({ data: { companyId: companyA, sku: `bulk-${i}-${suffix}`, name: `bulk ${i}`, netPrice: 10, grossPrice: 12 } })));
    await ticket(companyA, customerA, w1, [p.pan!, p.cafe!, ...bulk.map((product) => product.id)]);
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [companyA, companyB].filter(Boolean)) {
      await prisma.salesDocumentItem.deleteMany({ where: { companyId } });
      await prisma.salesDocument.deleteMany({ where: { companyId } });
      await prisma.productSupplier.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  const basket = (extra: Partial<Parameters<typeof getBasket>[1]> = {}) => getBasket(companyA, { warehouseId: w1, periodDays: 30, minTogether: 5, differentSuppliers: false, ...extra }, now);

  it('cuenta boletas y pares con la boleta como unidad', async () => {
    const data = await basket();
    expect(data.tickets).toBe(20);
    expect(data.multiTickets).toBe(6);
    expect(data.avgProducts).toBeCloseTo(26 / 20, 5);
    expect(data.pairs).toHaveLength(1);
    const [pair] = data.pairs;
    expect(pair).toMatchObject({ together: 6, withA: 6, withB: 6 });
    expect(new Set([pair!.productA.name, pair!.productB.name])).toEqual(new Set(['miel', 'queso']));
    expect(pair!.lift).toBeCloseTo((6 * 20) / (6 * 6), 5);
    expect(data.combos).toHaveLength(1);
  });

  it('el mínimo de boletas juntos y el filtro de proveedores distintos', async () => {
    expect((await basket({ minTogether: 10 })).pairs).toEqual([]);
    const distintos = await basket({ differentSuppliers: true });
    expect(distintos.pairs).toHaveLength(1);
    expect(new Set([distintos.pairs[0]!.productA.supplier, distintos.pairs[0]!.productB.supplier])).toEqual(new Set(['Apícola del Sur', 'Quesería del Valle']));
  });

  it('cada bodega y cada empresa por separado', async () => {
    const other = await basket({ warehouseId: w2 });
    expect(other.tickets).toBe(6);
    // Las 6 boletas de esa bodega traen los dos productos: ir juntos no dice nada (lift 1), no se muestra.
    expect(other.multiTickets).toBe(6);
    expect(other.pairs).toEqual([]);
    expect((await basket({ warehouseId: wB })).tickets).toBe(0);
  });
});

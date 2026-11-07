/** Integración real. Solo ANALYTICS_TEST_DATABASE_URL local con nombre *_test. */
import type { PrismaClient } from '@prisma/client';
import type { AuthContext } from '@/lib/auth/guards';
import { startOfTodaySantiago } from '@/lib/chile/timezone';
const testUrl = process.env.ANALYTICS_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Analytics solo admite una base local *_test');
}
const describeDb = testUrl ? describe : describe.skip;

describeDb('Analytics con PostgreSQL y empresas separadas', () => {
  let db: PrismaClient;
  let snapshot: typeof import('@/modules/analytics/service').analyticsSnapshot;
  const companies: string[] = [];
  let warehouse = '';
  let contact = '';
  let context: AuthContext;
  let midnight: Date;
  beforeAll(async () => {
    process.env.DATABASE_URL = testUrl;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma: db } = await import('@/lib/prisma'));
    ({ analyticsSnapshot: snapshot } = await import('@/modules/analytics/service'));
    for (const suffix of ['a', 'b']) {
      const company = await db.company.create({ data: { rut: `analytics-${Date.now()}-${suffix}`, businessName: `Empresa ${suffix}` } });
      companies.push(company.id);
      const wh = await db.warehouse.create({ data: { companyId: company.id, name: 'Central', code: 'CENTRAL' } });
      const customer = await db.contact.create({ data: { companyId: company.id, razonSocial: 'Cliente', rut: '11111111-1', rutClean: '111111111' } });
      if (suffix === 'a') { warehouse = wh.id; contact = customer.id; }
      else await db.salesDocument.create({ data: { companyId: company.id, warehouseId: wh.id, contactId: customer.id, dteType: 'BOLETA_39', status: 'ISSUED', paymentMethod: 'EFECTIVO', netAmount: 900000, totalAmount: 1071000 } });
      await db.auditLog.create({ data: { companyId: company.id, userEmail: 'privado@example.test', action: 'CREATE', entity: suffix === 'a' ? 'Product' : 'SecretOtherCompany', entityId: 'secret', metadata: { password: 'no-publicar' }, ipAddress: '127.0.0.99' } });
    }
    context = { companyId: companies[0], companyName: 'Empresa a', role: 'OWNER', permissions: ['sales:read', 'purchases:read', 'treasury:read', 'products:read', 'audit:read'] } as AuthContext;
    midnight = startOfTodaySantiago();
    const base = { companyId: companies[0], warehouseId: warehouse, contactId: contact, paymentMethod: 'EFECTIVO', issueDate: new Date(midnight.getTime() - 30 * 60000), status: 'ISSUED' as const };
    await db.salesDocument.createMany({ data: [
      { ...base, dteType: 'FACTURA_33', netAmount: 1000, exemptAmount: 100, ivaAmount: 190, totalAmount: 1290 },
      { ...base, dteType: 'NOTA_CREDITO_61', netAmount: 200, totalAmount: 238 },
      { ...base, dteType: 'NOTA_DEBITO_56', netAmount: 50, totalAmount: 60 },
      { ...base, dteType: 'COTIZACION', netAmount: 5000 },
      { ...base, dteType: 'GUIA_DESPACHO_52', netAmount: 5000 },
      { ...base, dteType: 'FACTURA_33', status: 'CANCELLED', netAmount: 5000 },
      { ...base, dteType: 'FACTURA_33', status: 'DRAFT', netAmount: 5000 },
      { ...base, dteType: 'BOLETA_39', netAmount: 100, issueDate: new Date(midnight.getTime() - 8 * 86400000) },
      { ...base, dteType: 'BOLETA_39', netAmount: 800000, issueDate: new Date(Date.now() + 86400000) },
    ] });
    await db.purchaseDocument.createMany({ data: [
      { companyId: companies[0], contactId: contact, documentType: 'FACTURA', folio: '1', status: 'ISSUED', issueDate: base.issueDate, netAmount: 400, totalAmount: 476 },
      { companyId: companies[0], contactId: contact, documentType: 'NOTA_CREDITO', folio: '2', status: 'ISSUED', issueDate: base.issueDate, netAmount: 100, totalAmount: 119 },
    ] });
  });
  afterAll(async () => {
    if (!db) return;
    for (const companyId of companies) {
      await db.salesDocument.deleteMany({ where: { companyId } });
      await db.purchaseDocument.deleteMany({ where: { companyId } });
      await db.auditLog.deleteMany({ where: { companyId } });
      await db.contact.deleteMany({ where: { companyId } });
      await db.warehouse.deleteMany({ where: { companyId } });
      await db.company.deleteMany({ where: { id: companyId } });
    }
    await db.$disconnect();
  });
  it('cuadra ventas netas, notas, compras y período anterior sin duplicar guías ni cotizaciones', async () => {
    const data = await snapshot(context, 'analytics', 7);
    expect(data.daily).toHaveLength(7);
    expect(data.totals.netSales).toBe(950);
    expect(data.totals.previousNetSales).toBe(100);
    expect(data.totals.documents).toBe(3);
    expect(data.totals.purchases).toBe(300);
    const yesterday = data.daily.at(-2)!;
    expect(yesterday.netSales).toBe(950);
    expect(data.daily.at(-1)!.netSales).toBe(0);
  });
  it('aísla empresa y expone solo campos de auditoría seleccionados', async () => {
    const data = await snapshot(context, 'analytics', 7);
    expect(data.companyId).toBe(companies[0]);
    expect(data.activity).toHaveLength(1);
    expect(Object.keys(data.activity[0]).sort()).toEqual(['action', 'at', 'entity', 'id']);
    expect(JSON.stringify(data)).not.toMatch(/SecretOtherCompany|privado@example|no-publicar|127.0.0.99/);
  });
  it('omite fuentes sin permisos y no construye un pronóstico sin historial', async () => {
    const data = await snapshot({ ...context, permissions: [] }, 'science', 7);
    expect(data.daily).toHaveLength(90);
    expect(data.totals.netSales).toBeNull();
    expect(data.operations).toEqual([]);
    expect(data.activity).toEqual([]);
    expect(data.science?.status).toBe('insufficient');
  });
  it('Data Science excluye hoy y usa 90 días completos', async () => {
    await db.salesDocument.create({ data: { companyId: companies[0], warehouseId: warehouse, contactId: contact, paymentMethod: 'EFECTIVO', status: 'ISSUED', dteType: 'BOLETA_39', netAmount: 7777, issueDate: new Date(midnight.getTime() + 1) } });
    const data = await snapshot(context, 'science', 30);
    expect(data.daily).toHaveLength(90);
    expect(data.totals.netSales).toBe(1050);
    expect(data.science?.status).toBe('insufficient');
  });
});

/**
 * Reseteo de datos de una empresa contra PostgreSQL real. Solo se habilita sobre
 * una base LOCAL desechable terminada en `_test`; nunca usa la DATABASE_URL del
 * .env (producción).
 *
 * WAREHOUSE_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/erp_pos_test \
 *   npx jest tests/company-reset-db.test.ts --runInBand
 */
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

describeDb('reseteo de datos de una empresa contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let reset: typeof import('@/lib/company-erasure/core');
  let cash: typeof import('@/modules/pos/services/cash.service');
  let pos: typeof import('@/modules/pos/services/pos.service');
  let stock: typeof import('@/modules/inventory/services/stock.service');
  const companyIds: string[] = [];
  const personIds: string[] = [];
  const run = Math.random().toString(36).slice(2, 10);
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    reset = await import('@/lib/company-erasure/core');
    cash = await import('@/modules/pos/services/cash.service');
    pos = await import('@/modules/pos/services/pos.service');
    stock = await import('@/modules/inventory/services/stock.service');
  });

  /** Una empresa con de todo un poco: ventas con asientos, caja, inventario, contactos, certamen, mensajería y accesos de seller. */
  async function company(label: string) {
    const key = `${run}-${++counter}`;
    const created = await prisma.company.create({
      data: {
        rut: `reset-${key}`,
        businessName: `${label} ${key}`,
        features: { create: { hasPos: true, hasInventory: true, hasAccounting: true } },
        settings: { create: { allowNegativeStock: false, fiscalYear: 2031, bankTransferInfo: 'Banco de prueba' } },
      },
    });
    companyIds.push(created.id);
    const companyId = created.id;
    const { ensureChartOfAccounts } = await import('@/modules/accounting/services/chart-setup.service');
    await ensureChartOfAccounts(companyId);

    const warehouse = await prisma.warehouse.create({ data: { companyId, name: 'Bodega de prueba', code: 'BP', isDefault: true } });
    const role = await prisma.customRole.create({ data: { companyId, name: 'Rol a medida', permissions: ['sales:read'] } });
    const position = await prisma.jobPosition.create({ data: { companyId, name: 'Cajera' } });
    const boss = await prisma.user.create({ data: { companyId, email: `jefe-${key}@test.cl`, name: 'Jefa', role: 'OWNER', passwordHash: 'x', customRoleId: role.id } });
    const cashier = await prisma.user.create({
      data: { companyId, email: `caja-${key}@test.cl`, name: 'Cajero', role: 'SALES', passwordHash: 'x', managerId: boss.id, jobPositionId: position.id },
    });
    await prisma.invitation.create({
      data: { companyId, email: `pendiente-${key}@test.cl`, role: 'SALES', token: `tok-${key}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    const register = await cash.createCashRegister(companyId, { name: 'Caja 1', warehouseId: warehouse.id });
    const product = await prisma.product.create({
      data: { companyId, sku: `RS-${key}`, name: 'Producto de prueba', netPrice: 1000, grossPrice: 1190, isTrackable: true },
    });
    await stock.registerStockIn(companyId, { productId: product.id, warehouseId: warehouse.id, type: 'ADJUSTMENT_IN', quantity: 10, unitCost: 400, userId: cashier.id });
    const shift = await cash.openShift(companyId, cashier.id, { cashRegisterId: register.id, initialAmount: 5000 });
    await pos.createPosSale(companyId, cashier.id, shift.id, { items: [{ productId: product.id, quantity: 2 }], paymentMethod: 'EFECTIVO', cashReceived: 5000 });

    const supplier = await prisma.contact.create({ data: { companyId, rut: `7${counter}.000.000-0`, rutClean: `7${counter}0000000`, razonSocial: 'Proveedor de prueba', isSupplier: true } });
    await prisma.project.create({ data: { companyId, code: `PRJ-${key}`, name: 'Certamen de prueba', startDate: new Date() } });
    const conversation = await prisma.conversation.create({
      data: { companyId, createdById: boss.id, participants: { create: [{ userId: boss.id }, { userId: cashier.id }] } },
    });
    await prisma.message.create({ data: { companyId, conversationId: conversation.id, senderId: boss.id, ciphertext: 'mensaje cifrado' } });
    const person = await prisma.supplierPortalPerson.create({ data: { email: `seller-${key}@test.cl`, name: 'Seller' } });
    personIds.push(person.id);
    await prisma.supplierPortalMembership.create({ data: { companyId, supplierId: supplier.id, personId: person.id, personName: 'Seller' } });
    await prisma.auditLog.create({ data: { companyId, userId: boss.id, userEmail: boss.email, action: 'CREATE', entity: 'Test', entityId: 'x' } });
    return { companyId, userIds: [boss.id, cashier.id], personId: person.id, warehouseId: warehouse.id };
  }

  const tenantCounts = async (companyId: string, tables: readonly string[]) => reset.countRows(prisma, tables, companyId);

  async function planFor() {
    const facts = await reset.loadSchemaFacts(prisma);
    return { facts, plan: reset.buildResetPlan({ tenantTables: facts.tenantTables, foreignKeys: facts.foreignKeys }) };
  }

  afterAll(async () => {
    if (!prisma) return;
    try {
      const { facts, plan } = await planFor();
      for (const companyId of companyIds) {
        await prisma.$transaction((tx) => reset.runReset(tx, { companyId, plan, facts }), { timeout: 120_000 });
        await prisma.platformAuditLog.deleteMany({ where: { companyId } });
        await prisma.invitation.deleteMany({ where: { companyId } });
        await prisma.user.updateMany({ where: { companyId }, data: { managerId: null } });
        await prisma.user.deleteMany({ where: { companyId } });
        await prisma.customRole.deleteMany({ where: { companyId } });
        await prisma.companyFeatures.deleteMany({ where: { companyId } });
        await prisma.companySettings.deleteMany({ where: { companyId } });
        await prisma.company.deleteMany({ where: { id: companyId } });
      }
      await prisma.supplierPortalPerson.deleteMany({ where: { id: { in: personIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('el plan cubre las ~170 tablas de la base: ninguna con companyId queda fuera y el orden respeta cada llave foránea', async () => {
    const { facts, plan } = await planFor();
    const kept = new Set(reset.KEPT_TENANT_TABLES);
    expect(facts.tenantTables.length).toBeGreaterThan(150);
    // Todo lo que tiene companyId se borra o se conserva a propósito.
    for (const table of facts.tenantTables) expect(plan.deleteOrder.includes(table) || kept.has(table)).toBe(true);
    for (const table of reset.KEPT_TENANT_TABLES) expect(facts.tenantTables).toContain(table);
    expect(new Set(plan.deleteOrder).size).toBe(plan.deleteOrder.length);
    // Hijas antes que madres, para cada llave foránea que de verdad bloquea (RESTRICT / NO ACTION).
    const at = new Map(plan.deleteOrder.map((table, index) => [table, index]));
    for (const fk of facts.foreignKeys) {
      if (fk.child === fk.parent || !at.has(fk.child) || !at.has(fk.parent)) continue;
      if (fk.onDelete !== 'r' && fk.onDelete !== 'a') continue;
      expect(at.get(fk.child)!).toBeLessThan(at.get(fk.parent)!);
    }
    expect(plan.selfReferences.map((ref) => `${ref.table}.${ref.columns.join(',')}`)).toEqual(expect.arrayContaining(['Account.parentId', 'JournalEntry.reversalOfId']));
  });

  it('borra los datos de la empresa y deja usuarios, roles, módulos y configuración; las demás empresas ni se enteran', async () => {
    const target = await company('Chakra de prueba');
    const bystander = await company('Otra empresa');
    const { facts, plan } = await planFor();
    const beforeTarget = await tenantCounts(target.companyId, plan.deleteOrder);
    const beforeBystander = await tenantCounts(bystander.companyId, [...plan.deleteOrder, ...reset.KEPT_TENANT_TABLES]);
    // La fixture sí dejó de todo.
    for (const table of ['SalesDocument', 'SalesDocumentItem', 'JournalEntry', 'JournalLine', 'Account', 'AccountMapping', 'Product', 'Stock', 'InventoryMovement', 'Warehouse', 'CashRegister', 'CashShift', 'Contact', 'Project', 'Conversation', 'Message', 'JobPosition', 'SupplierPortalMembership', 'AuditLog']) {
      expect(beforeTarget[table]).toBeGreaterThan(0);
    }
    const keptBefore = await tenantCounts(target.companyId, reset.KEPT_TENANT_TABLES);

    const outcome = await prisma.$transaction((tx) => reset.runReset(tx, { companyId: target.companyId, plan, facts }), { timeout: 120_000 });

    expect(outcome.deleted).toEqual(beforeTarget);
    expect(await tenantCounts(target.companyId, plan.deleteOrder)).toEqual({});
    // Lo que se conserva queda igual.
    expect(await tenantCounts(target.companyId, reset.KEPT_TENANT_TABLES)).toEqual(keptBefore);
    const users = await prisma.user.findMany({ where: { companyId: target.companyId }, select: { id: true, jobPositionId: true, customRoleId: true, managerId: true } });
    expect(users).toHaveLength(2);
    expect(users.every((user) => user.jobPositionId === null)).toBe(true);
    expect(users.some((user) => user.customRoleId !== null)).toBe(true);
    expect(users.some((user) => user.managerId !== null)).toBe(true);
    expect((await prisma.companySettings.findUniqueOrThrow({ where: { companyId: target.companyId } })).fiscalYear).toBe(2031);
    expect((await prisma.companyFeatures.findUniqueOrThrow({ where: { companyId: target.companyId } })).hasAccounting).toBe(true);
    // Los participantes de las conversaciones se fueron con ellas; las personas del Seller Center sin acceso, también.
    expect(await prisma.conversationParticipant.count({ where: { userId: { in: target.userIds } } })).toBe(0);
    expect(await prisma.supplierPortalPerson.count({ where: { id: target.personId } })).toBe(0);
    // La otra empresa quedó intacta, incluida su persona del Seller Center.
    expect(await tenantCounts(bystander.companyId, [...plan.deleteOrder, ...reset.KEPT_TENANT_TABLES])).toEqual(beforeBystander);
    expect(await prisma.supplierPortalPerson.count({ where: { id: bystander.personId } })).toBe(1);
  });

  it('los triggers de inmutabilidad contable vuelven a quedar activos', async () => {
    const target = await company('Con asientos');
    const { facts, plan } = await planFor();
    await prisma.$transaction((tx) => reset.runReset(tx, { companyId: target.companyId, plan, facts }), { timeout: 120_000 });
    const enabled = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT tgname::text AS name FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'O' AND tgname IN ('trg_journal_entry_immutable', 'trg_journal_line_immutable')`
    );
    expect(enabled.map((row) => row.name).sort()).toEqual(['trg_journal_entry_immutable', 'trg_journal_line_immutable']);
    // Y el libro de otra empresa sigue inmutable.
    const other = await company('Libro inmutable');
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: other.companyId, status: 'POSTED' } });
    await expect(prisma.journalEntry.update({ where: { id: entry.id }, data: { description: 'cambiado' } })).rejects.toThrow();
  });

  it('si algo falla a mitad de camino, no se borra nada (rollback completo)', async () => {
    const target = await company('Con falla');
    const { facts, plan } = await planFor();
    const before = await tenantCounts(target.companyId, plan.deleteOrder);
    await expect(
      prisma.$transaction((tx) => reset.runReset(tx, {
        companyId: target.companyId, plan, facts,
        afterDelete: async () => { throw new Error('falla simulada al reprovisionar'); },
      }), { timeout: 120_000 })
    ).rejects.toThrow('falla simulada');
    expect(await tenantCounts(target.companyId, plan.deleteOrder)).toEqual(before);
    // Y el libro sigue protegido: el rollback devolvió los triggers.
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: target.companyId, status: 'POSTED' } });
    await expect(prisma.journalEntry.update({ where: { id: entry.id }, data: { description: 'cambiado' } })).rejects.toThrow();
  });

  it('afterDelete corre con la empresa ya vacía y en la misma transacción', async () => {
    const target = await company('Reprovisionada');
    const { facts, plan } = await planFor();
    await prisma.$transaction((tx) => reset.runReset(tx, {
      companyId: target.companyId, plan, facts,
      afterDelete: async (inner) => {
        expect(await inner.warehouse.count({ where: { companyId: target.companyId } })).toBe(0);
        await inner.warehouse.create({ data: { companyId: target.companyId, name: 'Bodega Principal', code: 'PRINCIPAL', isDefault: true } });
      },
    }), { timeout: 120_000 });
    const warehouses = await prisma.warehouse.findMany({ where: { companyId: target.companyId } });
    expect(warehouses.map((w) => w.code)).toEqual(['PRINCIPAL']);
  });

  it('avisa de lo que no parece de prueba: CAF, documentos enviados al SII, cobros reales', async () => {
    const target = await company('Con señales');
    expect(await reset.collectRealDataSignals(prisma, target.companyId)).toEqual([]);
    await prisma.salesDocument.updateMany({ where: { companyId: target.companyId }, data: { siiStatus: 'SENT' } });
    const signals = await reset.collectRealDataSignals(prisma, target.companyId);
    expect(signals).toEqual([{ label: 'documentos ya enviados al SII', count: 1 }]);
    await prisma.salesDocument.updateMany({ where: { companyId: target.companyId }, data: { siiStatus: 'PENDING' } });
    expect(await reset.collectRealDataSignals(prisma, target.companyId)).toEqual([]);
  });
});

/**
 * Órdenes de reiniciar y eliminar una empresa (Supersuite) contra PostgreSQL real, con el almacenamiento
 * simulado en memoria. Solo se habilita sobre una base LOCAL desechable terminada en `_test`; nunca usa la
 * DATABASE_URL del .env (producción).
 *
 * WAREHOUSE_TEST_DATABASE_URL=postgresql://...@127.0.0.1:5432/erp_pos_test \
 *   npx jest tests/company-erasure-db.test.ts --runInBand
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

// Almacenamiento en memoria: el privado (respaldos) y el borrado de archivos.
const mockPrivate = new Map<string, Buffer>();
const mockStorage = { configured: true, failPut: false, deleted: [] as string[] };
jest.mock('@/lib/storage/blob', () => ({
  privateStorageConfigured: () => mockStorage.configured,
  putPrivate: async (path: string, body: Buffer) => {
    if (mockStorage.failPut) throw new Error('R2 no responde');
    mockPrivate.set(path, Buffer.from(body));
    return { url: `r2private:///${path}`, pathname: path };
  },
  getPrivate: async (ref: string) => {
    const buffer = mockPrivate.get(ref.replace('r2private:///', ''));
    if (!buffer) return null;
    return { body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(buffer)); controller.close(); } }), contentType: 'application/json' };
  },
  del: async (urls: string | string[]) => {
    mockStorage.deleted.push(...(Array.isArray(urls) ? urls : [urls]));
  },
}));
const mockSupersuite = { eliminada: jest.fn() };
jest.mock('@/lib/supersuite', () => ({ empresaEliminadaSupersuite: (...args: unknown[]) => mockSupersuite.eliminada(...args) }));
const mockAudit = jest.fn(async () => undefined);
jest.mock('@/lib/auth/audit', () => ({ createAuditLog: (...args: unknown[]) => mockAudit(...(args as [])) }));
jest.mock('@/lib/observability', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.setTimeout(180_000);

const DAY = 24 * 60 * 60 * 1000;

describeDb('órdenes de reiniciar y eliminar una empresa contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let erasure: typeof import('@/modules/platform/services/company-erasure.service');
  let core: typeof import('@/lib/company-erasure/core');
  const companyIds: string[] = [];
  const run = Math.random().toString(36).slice(2, 8);
  let counter = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    erasure = await import('@/modules/platform/services/company-erasure.service');
    core = await import('@/lib/company-erasure/core');
  });

  beforeEach(() => {
    mockPrivate.clear();
    mockStorage.configured = true;
    mockStorage.failPut = false;
    mockStorage.deleted.length = 0;
    mockSupersuite.eliminada.mockClear();
    mockAudit.mockClear();
  });

  async function allTenantTablesButKept(): Promise<string[]> {
    const facts = await core.loadSchemaFacts(prisma);
    return facts.tenantTables.filter((table) => !core.KEPT_WHEN_DELETING.includes(table));
  }

  async function cleanup(companyId: string) {
    const facts = await core.loadSchemaFacts(prisma);
    if (await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })) {
      const plan = core.buildResetPlan({ tenantTables: facts.tenantTables, foreignKeys: facts.foreignKeys, mode: 'delete' });
      await prisma.$transaction((tx) => core.runReset(tx, { companyId, plan, facts, mode: 'delete' }), { timeout: 120_000 });
    }
    await prisma.companyErasureRequest.deleteMany({ where: { companyId } });
    await prisma.platformAuditLog.deleteMany({ where: { companyId } });
  }

  afterAll(async () => {
    if (!prisma) return;
    try {
      for (const id of companyIds) await cleanup(id);
    } finally {
      await prisma.$disconnect();
    }
  });

  /** Una empresa con datos de varias áreas, usuarios con rol a medida, archivos propios y ajenos. */
  async function company(label: string, options: { status?: 'ACTIVE' | 'SUSPENDED' } = {}) {
    const key = `${run}-${++counter}`;
    const created = await prisma.company.create({
      data: {
        rut: `era-${key}`,
        businessName: `${label} ${key}`,
        status: options.status ?? 'ACTIVE',
        features: { create: { hasPos: true, hasInventory: true, hasAccounting: true } },
        settings: { create: { fiscalYear: 2031 } },
      },
    });
    companyIds.push(created.id);
    const companyId = created.id;
    const { ensureChartOfAccounts } = await import('@/modules/accounting/services/chart-setup.service');
    await ensureChartOfAccounts(companyId);

    const own = (name: string) => `https://abc123.public.blob.vercel-storage.com/products/${companyId}/${name}`;
    const warehouse = await prisma.warehouse.create({ data: { companyId, name: 'Bodega de prueba', code: 'BP', isDefault: true } });
    const role = await prisma.customRole.create({ data: { companyId, name: 'Rol a medida', permissions: ['sales:read'] } });
    const boss = await prisma.user.create({ data: { companyId, email: `jefe-${key}@test.cl`, name: 'Jefa', role: 'OWNER', passwordHash: 'x', customRoleId: role.id } });
    const cashier = await prisma.user.create({ data: { companyId, email: `caja-${key}@test.cl`, name: 'Cajero', role: 'SALES', passwordHash: 'x', managerId: boss.id } });
    const customer = await prisma.contact.create({ data: { companyId, rut: `c-${key}`, rutClean: `c${key}`, razonSocial: 'Cliente', isCustomer: true } });
    const product = await prisma.product.create({ data: { companyId, sku: `ERA-${key}`, name: 'Producto con foto', netPrice: 1000, grossPrice: 1190, imageUrl: own('frente.jpg') } });
    await prisma.product.create({ data: { companyId, sku: `ERB-${key}`, name: 'Producto con foto ajena', netPrice: 1000, grossPrice: 1190, imageUrl: `https://abc123.public.blob.vercel-storage.com/products/otra-empresa-id/ajena.jpg` } });
    await prisma.product.create({ data: { companyId, sku: `ERC-${key}`, name: 'Producto con logo compartido', netPrice: 1000, grossPrice: 1190, imageUrl: 'https://abc123.public.blob.vercel-storage.com/branding/compartido.png' } });
    await prisma.stock.create({ data: { companyId, productId: product.id, warehouseId: warehouse.id, quantity: 5 } });
    await prisma.salesDocument.create({
      data: {
        companyId, contactId: customer.id, warehouseId: warehouse.id, dteType: 'BOLETA_39', folio: 1, status: 'ISSUED', paymentMethod: 'EFECTIVO',
        netAmount: 1000, ivaAmount: 190, totalAmount: 1190, sellerId: cashier.id,
        items: { create: [{ companyId, productId: product.id, description: 'Producto con foto', quantity: 1, unitPrice: 1000, subtotal: 1000, iva: 190, total: 1190 }] },
      },
    });
    // Una dirección DENTRO de un JSON (como los bloques de un sitio): también se encuentra.
    await prisma.auditLog.create({ data: { companyId, userId: boss.id, userEmail: boss.email, action: 'CREATE', entity: 'Test', entityId: 'x', metadata: { bloques: [{ tipo: 'imagen', src: own('en-json.webp') }] } } });
    const conversation = await prisma.conversation.create({ data: { companyId, createdById: boss.id, participants: { create: [{ userId: boss.id }, { userId: cashier.id }] } } });
    await prisma.message.create({ data: { companyId, conversationId: conversation.id, senderId: boss.id, ciphertext: 'cifrado' } });
    return { companyId, name: created.businessName, rut: created.rut, userIds: [boss.id, cashier.id], ownFiles: [own('frente.jpg'), own('en-json.webp')], otherCompanyId: 'otra-empresa-id' };
  }

  const tablesLeft = async (companyId: string, but: readonly string[]) => core.countRows(prisma, (await allTenantTablesButKept()).filter((t) => !but.includes(t)), companyId);

  describe('reiniciar', () => {
    it('la solicitud cuenta lo que se borraría, entrega un código y guarda solo su hash; no borra nada', async () => {
      const f = await company('Reinicio');
      const before = await prisma.product.count({ where: { companyId: f.companyId } });
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET', orderId: 41 });
      expect(requested.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(requested.preview.rows).toBeGreaterThan(20);
      expect(requested.preview.tables.Product).toBe(3);
      expect(requested.preview.tables.User).toBeUndefined();
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(before);
      const row = await prisma.companyErasureRequest.findUniqueOrThrow({ where: { id: requested.requestId } });
      expect(row).toMatchObject({ kind: 'RESET', status: 'PENDING', requestedOrder: 41, companyRut: f.rut, attempts: 0 });
      expect(JSON.stringify(row)).not.toContain(requested.code);
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(mockPrivate.size).toBe(0);
    });

    it('una solicitud nueva reemplaza a la anterior: el código viejo ya no sirve', async () => {
      const f = await company('Reemplazo');
      const first = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      const second = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      expect(first.code).not.toBe(second.code);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code: first.code, businessName: f.name })).rejects.toThrow(/cancelada o reemplazada/);
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(3);
    });

    it('confirmar borra los datos, deja usuarios, roles, módulos y configuración, repone bodega y plan de cuentas y guarda un respaldo legible', async () => {
      const f = await company('Confirmar');
      const { code, preview } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET', orderId: 7 });
      const result = await erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code: code.toLowerCase().replace('-', ' '), businessName: `  ${f.name.toUpperCase()} ` });

      expect(result).toMatchObject({ kind: 'RESET', alreadyDone: false, rows: preview.rows, chartOfAccounts: true });
      // Todo lo de negocio se fue, salvo lo que se vuelve a sembrar.
      const left = await tablesLeft(f.companyId, core.KEPT_TENANT_TABLES);
      expect(Object.keys(left).sort()).toEqual(['Account', 'AccountMapping', 'Warehouse']);
      expect(left.Warehouse).toBe(1);
      expect((await prisma.warehouse.findFirstOrThrow({ where: { companyId: f.companyId } })).code).toBe('PRINCIPAL');
      // Usuarios, rol a medida, módulos y configuración siguen.
      expect(await prisma.user.count({ where: { companyId: f.companyId } })).toBe(2);
      expect(await prisma.customRole.count({ where: { companyId: f.companyId } })).toBe(1);
      expect((await prisma.companyFeatures.findUniqueOrThrow({ where: { companyId: f.companyId } })).hasAccounting).toBe(true);
      expect((await prisma.companySettings.findUniqueOrThrow({ where: { companyId: f.companyId } })).fiscalYear).toBe(2031);
      // La conversación se fue, los participantes también (cascada) y las personas siguen.
      expect(await prisma.conversationParticipant.count({ where: { userId: { in: f.userIds } } })).toBe(0);
      // Respaldo: un JSON entero, guardado en el almacenamiento privado ANTES de borrar.
      expect(mockPrivate.size).toBe(1);
      const [[key, buffer]] = [...mockPrivate.entries()];
      expect(key).toMatch(new RegExp(`^platform-backups/${f.companyId}/\\d{8}T\\d{6}-respaldo-`));
      const backup = JSON.parse(buffer.toString('utf8'));
      expect(backup.company.id).toBe(f.companyId);
      expect(backup.counts.Product).toBe(3);
      expect(backup.data.Product).toHaveLength(3);
      expect(result.backup).toMatchObject({ ref: `r2private:///${key}`, bytes: buffer.length });
      // Solicitud hecha, huella en la plataforma y una primera línea en la bitácora de la empresa.
      const row = await prisma.companyErasureRequest.findFirstOrThrow({ where: { companyId: f.companyId, kind: 'RESET' } });
      expect(row).toMatchObject({ status: 'DONE' });
      expect(row.finishedAt).not.toBeNull();
      const platform = await prisma.platformAuditLog.findFirstOrThrow({ where: { companyId: f.companyId } });
      expect(platform).toMatchObject({ action: 'company.data_reset', performedByEmail: 'supersuite' });
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ companyId: f.companyId, userEmail: 'supersuite', metadata: expect.objectContaining({ reason: 'company_data_reset' }) }));
      // Reiniciar NO borra archivos.
      expect(mockStorage.deleted).toEqual([]);
      expect(mockSupersuite.eliminada).not.toHaveBeenCalled();
    });

    it('una orden reentregada después de hacerse responde que ya estaba hecha y no vuelve a borrar', async () => {
      const f = await company('Reentrega');
      const { code } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      const first = await erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name });
      // La empresa sigue operando y crea algo nuevo; la reentrega NO debe borrarlo.
      await prisma.contact.create({ data: { companyId: f.companyId, rut: `nuevo-${run}`, rutClean: `nuevo${run}`, razonSocial: 'Cliente nuevo', isCustomer: true } });
      const again = await erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name }, new Date(Date.now() + 5 * DAY));
      expect(again).toMatchObject({ alreadyDone: true, rows: first.rows });
      expect(await prisma.contact.count({ where: { companyId: f.companyId } })).toBe(1);
      expect(mockPrivate.size).toBe(1);
    });

    it('un código equivocado o una razón social distinta no borran nada y cuentan como intento; a los 5 la solicitud se cancela', async () => {
      const f = await company('Intentos');
      const { code } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code: 'ZZZZZ-ZZZZZ', businessName: f.name })).rejects.toThrow(/no corresponde/);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: 'Otra empresa SpA' })).rejects.toThrow(/razón social/);
      expect((await prisma.companyErasureRequest.findFirstOrThrow({ where: { companyId: f.companyId } })).attempts).toBe(2);
      for (let i = 0; i < 3; i += 1) await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code: 'ZZZZZ-ZZZZZ', businessName: f.name })).rejects.toThrow();
      // Ya cancelada: ni siquiera el código bueno la revive.
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name })).rejects.toThrow(/cancelada/);
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(3);
      expect(mockPrivate.size).toBe(0);
    });

    it('el código de una empresa no sirve para otra', async () => {
      const a = await company('A');
      const b = await company('B');
      const { code } = await erasure.requestErasure({ companyId: a.companyId, kind: 'RESET' });
      await expect(erasure.confirmErasure({ companyId: b.companyId, kind: 'RESET', code, businessName: b.name })).rejects.toThrow(/no corresponde/);
      expect(await prisma.product.count({ where: { companyId: b.companyId } })).toBe(3);
    });

    it('un código vencido (30 minutos) hay que pedirlo de nuevo', async () => {
      const f = await company('Vencido');
      const { code } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name }, new Date(Date.now() + 31 * 60_000))).rejects.toThrow(/venció/);
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(3);
    });

    it('sin almacenamiento privado, o si el respaldo falla, no se borra nada y la solicitud queda lista para reintentar', async () => {
      const f = await company('Sin respaldo');
      const { code } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });

      mockStorage.configured = false;
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name })).rejects.toThrow(/almacenamiento privado.*no se borra nada|no se borró nada/s);
      mockStorage.configured = true;
      mockStorage.failPut = true;
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name })).rejects.toThrow(/no se borró nada/);
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(3);
      expect((await prisma.companyErasureRequest.findFirstOrThrow({ where: { companyId: f.companyId } })).status).toBe('PENDING');

      // Arreglado el almacenamiento, la MISMA solicitud se puede confirmar.
      mockStorage.failPut = false;
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name })).resolves.toMatchObject({ alreadyDone: false });
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(0);
    });

    it('un respaldo que no se puede leer de vuelta tampoco permite borrar', async () => {
      const f = await company('Respaldo roto');
      const { code } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      const storage = jest.requireMock('@/lib/storage/blob') as { putPrivate: (path: string, body: Buffer) => Promise<{ url: string; pathname: string }> };
      const original = storage.putPrivate;
      // Guarda un archivo truncado: la comprobación de lectura lo detecta.
      storage.putPrivate = async (path, body) => original(path, body.subarray(0, Math.floor(body.length / 2)));
      try {
        await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name })).rejects.toThrow(/no coincide con el original/);
      } finally {
        storage.putPrivate = original;
      }
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(3);
    });

    it('lo que no parece de prueba exige aceptarlo expresamente', async () => {
      const f = await company('Datos reales');
      await prisma.salesDocument.updateMany({ where: { companyId: f.companyId }, data: { siiStatus: 'SENT' } });
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      expect(requested.preview.signals).toEqual([{ label: 'documentos ya enviados al SII', count: 1 }]);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code: requested.code, businessName: f.name })).rejects.toThrow(/aceptoDatosReales/);
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(3);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code: requested.code, businessName: f.name, acceptRealData: true })).resolves.toMatchObject({ alreadyDone: false });
    });

    it('dos confirmaciones al mismo tiempo ejecutan una sola vez', async () => {
      const f = await company('Carrera');
      const { code } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      const settled = await Promise.allSettled([
        erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name }),
        erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name }),
      ]);
      const executed = settled.filter((r) => r.status === 'fulfilled' && !r.value.alreadyDone);
      expect(executed).toHaveLength(1);
      expect(mockPrivate.size).toBe(1);
      expect(await prisma.platformAuditLog.count({ where: { companyId: f.companyId, action: 'company.data_reset' } })).toBe(1);
      expect(await prisma.warehouse.count({ where: { companyId: f.companyId } })).toBe(1);
    });

    it('cancelar descarta la solicitud pendiente', async () => {
      const f = await company('Cancelar');
      const { code } = await erasure.requestErasure({ companyId: f.companyId, kind: 'RESET' });
      expect(await erasure.cancelErasure({ companyId: f.companyId, kind: 'RESET' })).toBe(1);
      expect(await erasure.cancelErasure({ companyId: f.companyId, kind: 'RESET' })).toBe(0);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'RESET', code, businessName: f.name })).rejects.toThrow(/cancelada/);
    });
  });

  describe('eliminar', () => {
    it('una empresa que opera no se puede ni pedir eliminar', async () => {
      const f = await company('Operando');
      await expect(erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' })).rejects.toThrow(/suspenderla/);
      expect(await prisma.companyErasureRequest.count({ where: { companyId: f.companyId } })).toBe(0);
    });

    it('quien también administra otras empresas bloquea la eliminación hasta revocar ese acceso', async () => {
      const f = await company('Con acceso ajeno', { status: 'SUSPENDED' });
      const other = await company('Otra empresa');
      await prisma.companyMembership.create({ data: { companyId: other.companyId, userId: f.userIds[0], role: 'ADMIN' } });
      await expect(erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' })).rejects.toThrow(/administra otras/);
      await prisma.companyMembership.deleteMany({ where: { companyId: other.companyId } });
      await expect(erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' })).resolves.toBeDefined();
    });

    it('la solicitud entrega la ventana: 7 días de espera y otros 7 para confirmar; antes no se puede', async () => {
      const f = await company('Espera', { status: 'SUSPENDED' });
      const now = new Date();
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' }, now);
      expect(requested.notBefore.getTime() - now.getTime()).toBe(7 * DAY);
      expect(requested.expiresAt.getTime() - requested.notBefore.getTime()).toBe(7 * DAY);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, new Date(now.getTime() + 6 * DAY))).rejects.toThrow(/Todavía no se puede confirmar/);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, new Date(now.getTime() + 15 * DAY))).rejects.toThrow(/venció/);
      expect(await prisma.company.count({ where: { id: f.companyId } })).toBe(1);
      expect(mockPrivate.size).toBe(0);
    });

    it('si la empresa vuelve a operar durante la espera, ya no se puede confirmar', async () => {
      const f = await company('Reactivada', { status: 'SUSPENDED' });
      const now = new Date();
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' }, now);
      await prisma.company.update({ where: { id: f.companyId }, data: { status: 'ACTIVE' } });
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, new Date(now.getTime() + 8 * DAY))).rejects.toThrow(/volvió a operar/);
      expect(await prisma.company.count({ where: { id: f.companyId } })).toBe(1);
    });

    it('cancelar las eliminaciones pendientes (lo que hace reactivar la cuenta) deja la solicitud sin efecto', async () => {
      const f = await company('Cancelada', { status: 'SUSPENDED' });
      const now = new Date();
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' }, now);
      expect(await erasure.cancelErasure({ companyId: f.companyId, kind: 'DELETE', reason: 'la empresa volvió a operar' })).toBe(1);
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, new Date(now.getTime() + 8 * DAY))).rejects.toThrow(/cancelada/);
    });

    it('confirmada en su ventana borra TODO, la empresa incluida, con su respaldo y solo los archivos que son suyos', async () => {
      const f = await company('Eliminada', { status: 'SUSPENDED' });
      const now = new Date();
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE', orderId: 99 }, now);
      const later = new Date(now.getTime() + 8 * DAY);
      const result = await erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, later);

      expect(result).toMatchObject({ kind: 'DELETE', alreadyDone: false, files: { found: 2, deleted: 2, failed: 0, notAttributed: 2 } });
      expect(result.rows).toBeGreaterThan(requested.preview.rows - 1);
      // No queda NADA: ni una fila en ninguna tabla con companyId (salvo la huella), ni la empresa.
      expect(await tablesLeft(f.companyId, [])).toEqual({});
      expect(await prisma.company.findUnique({ where: { id: f.companyId } })).toBeNull();
      expect(await prisma.user.count({ where: { id: { in: f.userIds } } })).toBe(0);
      expect(await prisma.conversationParticipant.count({ where: { userId: { in: f.userIds } } })).toBe(0);
      // Archivos: los propios (también el que estaba dentro de un JSON) se borran; el ajeno y el compartido, no.
      expect(mockStorage.deleted.sort()).toEqual([...f.ownFiles].sort());
      // Respaldo guardado antes de borrar.
      expect(mockPrivate.size).toBe(1);
      expect(result.backup?.ref).toMatch(new RegExp(`^r2private:///platform-backups/${f.companyId}/`));
      // La huella sobrevive a la empresa.
      const row = await prisma.companyErasureRequest.findFirstOrThrow({ where: { companyId: f.companyId, kind: 'DELETE' } });
      expect(row).toMatchObject({ status: 'DONE', companyName: f.name, companyRut: f.rut, requestedOrder: 99 });
      expect((row.result as { files?: { deleted: number } }).files?.deleted).toBe(2);
      const platform = await prisma.platformAuditLog.findFirstOrThrow({ where: { companyId: f.companyId } });
      expect(platform).toMatchObject({ action: 'COMPANY_DELETED', companyBusinessName: f.name });
      expect(mockSupersuite.eliminada).toHaveBeenCalledWith(f.companyId, f.name);
    });

    it('una orden reentregada cuando la empresa ya no existe responde que ya estaba eliminada', async () => {
      const f = await company('Reentregada', { status: 'SUSPENDED' });
      const now = new Date();
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' }, now);
      const later = new Date(now.getTime() + 8 * DAY);
      await erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, later);
      mockPrivate.clear();
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, new Date(later.getTime() + 20 * DAY))).resolves.toMatchObject({ alreadyDone: true, kind: 'DELETE' });
      expect(mockPrivate.size).toBe(0);
    });

    it('si se falla el respaldo no se elimina nada, ni los archivos', async () => {
      const f = await company('Sin respaldo eliminar', { status: 'SUSPENDED' });
      const now = new Date();
      const requested = await erasure.requestErasure({ companyId: f.companyId, kind: 'DELETE' }, now);
      mockStorage.failPut = true;
      await expect(erasure.confirmErasure({ companyId: f.companyId, kind: 'DELETE', code: requested.code, businessName: f.name }, new Date(now.getTime() + 8 * DAY))).rejects.toThrow(/no se borró nada/);
      expect(await prisma.company.count({ where: { id: f.companyId } })).toBe(1);
      expect(await prisma.product.count({ where: { companyId: f.companyId } })).toBe(3);
      expect(mockStorage.deleted).toEqual([]);
    });

    it('no toca a las demás empresas', async () => {
      const gone = await company('Se va', { status: 'SUSPENDED' });
      const stays = await company('Se queda');
      const staysBefore = await core.countRows(prisma, (await allTenantTablesButKept()), stays.companyId);
      const now = new Date();
      const requested = await erasure.requestErasure({ companyId: gone.companyId, kind: 'DELETE' }, now);
      await erasure.confirmErasure({ companyId: gone.companyId, kind: 'DELETE', code: requested.code, businessName: gone.name }, new Date(now.getTime() + 8 * DAY));
      expect(await core.countRows(prisma, (await allTenantTablesButKept()), stays.companyId)).toEqual(staysBefore);
      expect(mockStorage.deleted.every((url) => url.includes(gone.companyId))).toBe(true);
    });
  });

  it('el plan de eliminar cubre todas las tablas con companyId salvo la huella, y se arma sin problemas con el esquema real', async () => {
    const facts = await core.loadSchemaFacts(prisma);
    const plan = core.buildResetPlan({ tenantTables: facts.tenantTables, foreignKeys: facts.foreignKeys, mode: 'delete' });
    expect(plan.deleteOrder.sort()).toEqual(facts.tenantTables.filter((t) => !core.KEPT_WHEN_DELETING.includes(t)).sort());
    expect(plan.deleteOrder).toContain('User');
    expect(plan.deleteOrder).not.toContain('PlatformAuditLog');
    expect(plan.deleteOrder).not.toContain('CompanyErasureRequest');
    expect(plan.selfReferences.map((ref) => `${ref.table}.${ref.columns.join(',')}`)).toEqual(expect.arrayContaining(['User.managerId']));
  });
});

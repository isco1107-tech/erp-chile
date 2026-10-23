/**
 * Portal de inventario del proveedor contra una base PostgreSQL REAL (mismas reglas de seguridad
 * que `tests/warehouse-mobile-db.test.ts`: solo corre contra una base local cuyo nombre termina en
 * `_test`).
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/supplier-portal-db.test.ts
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

describeDb('portal de inventario del proveedor contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let service: typeof import('@/modules/inventory/services/supplier-portal.service');

  const suffix = Math.random().toString(36).slice(2, 8);
  const ids = { companyA: '', companyB: '', whCentral: '', whSucursal: '', s1: '', s2: '', sB: '', notSupplier: '', p1: '', p2: '', p3: '', pArchived: '', pB: '', user: '' };
  let code1 = '';
  let code2 = '';

  const company = (n: number, name: string) => prisma.company.create({ data: { rut: `77${suffix}${n}-${n}`, businessName: name, features: { create: {} } } });
  const contact = (companyId: string, razonSocial: string, rut: string, isSupplier = true) =>
    prisma.contact.create({ data: { companyId, razonSocial, rut, rutClean: rut.replace(/[.-]/g, ''), isSupplier, isCustomer: !isSupplier } });
  const product = (companyId: string, sku: string, name: string, extra: Record<string, unknown> = {}) =>
    prisma.product.create({ data: { companyId, sku, name, netPrice: 1990, grossPrice: 2368, costPricePMP: 777, minStock: 0, ...extra } });
  const stock = (companyId: string, productId: string, warehouseId: string, quantity: number) => prisma.stock.create({ data: { companyId, productId, warehouseId, quantity } });
  const movement = (data: { companyId: string; productId: string; warehouseId: string; type: 'PURCHASE_IN' | 'SALE_OUT' | 'ADJUSTMENT_OUT' | 'ADJUSTMENT_IN'; quantity: number; supplierId?: string; createdAt?: Date }) =>
    prisma.inventoryMovement.create({ data: { unitCost: 0, totalCost: 0, previousStock: 0, newStock: 0, previousPmp: 0, newPmp: 0, ...data } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    service = await import('@/modules/inventory/services/supplier-portal.service');

    ids.companyA = (await company(1, `Empresa Proveedores A ${suffix}`)).id;
    ids.companyB = (await company(2, `Empresa Proveedores B ${suffix}`)).id;
    ids.whCentral = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Central', code: 'CEN', isDefault: true } })).id;
    ids.whSucursal = (await prisma.warehouse.create({ data: { companyId: ids.companyA, name: 'Sucursal', code: 'SUC' } })).id;
    ids.user = (await prisma.user.create({ data: { email: `admin-${suffix}@test.cl`, passwordHash: 'x', name: 'Admin', companyId: ids.companyA, role: 'ADMIN' } })).id;
    ids.s1 = (await contact(ids.companyA, 'Distribuidora Uno SpA', `78.${suffix.slice(0, 3)}.001-1`)).id;
    ids.s2 = (await contact(ids.companyA, 'Importadora Dos Ltda', `78.${suffix.slice(0, 3)}.002-2`)).id;
    ids.notSupplier = (await contact(ids.companyA, 'Un Cliente', `78.${suffix.slice(0, 3)}.003-3`, false)).id;
    ids.sB = (await contact(ids.companyB, 'Proveedor Empresa B', `78.${suffix.slice(0, 3)}.004-4`)).id;

    ids.p1 = (await product(ids.companyA, 'P1', 'Aceite Uno', { minStock: 20, brand: 'Chef' })).id;
    ids.p2 = (await product(ids.companyA, 'P2', 'Arroz Dos')).id;
    ids.p3 = (await product(ids.companyA, 'P3', 'Fideos Tres (de otro proveedor)')).id;
    ids.pArchived = (await product(ids.companyA, 'PX', 'Producto Archivado', { isActive: false })).id;
    ids.pB = (await product(ids.companyB, 'P1', 'Producto de la empresa B')).id;

    await stock(ids.companyA, ids.p1, ids.whCentral, 12);
    await stock(ids.companyA, ids.p1, ids.whSucursal, 3);
    await stock(ids.companyA, ids.p2, ids.whCentral, 0);
    await stock(ids.companyA, ids.p3, ids.whCentral, 99);
    await stock(ids.companyA, ids.pArchived, ids.whCentral, 5);

    for (const productId of [ids.p1, ids.p2, ids.pArchived]) await service.linkSupplierProduct(ids.companyA, ids.s1, productId);
    await service.linkSupplierProduct(ids.companyA, ids.s2, ids.p3);
    await service.linkSupplierProduct(ids.companyA, ids.s2, ids.p1); // p1 lo surten los dos proveedores

    code1 = (await service.generateSupplierPortalCode(ids.companyA, ids.s1, ids.user)).code;
    code2 = (await service.generateSupplierPortalCode(ids.companyA, ids.s2, ids.user)).code;
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [ids.companyA, ids.companyB].filter(Boolean)) {
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.supplierPortalAccess.deleteMany({ where: { companyId } });
      await prisma.productSupplier.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  it('el código se entrega en grupos de cuatro y la base solo guarda su huella', async () => {
    expect(code1).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    const rows = await prisma.supplierPortalAccess.findMany({ where: { companyId: ids.companyA } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(code1.replace(/-/g, ''));
    }
    expect(rows.find((row) => row.contactId === ids.s1)?.codeHint).toBe(code1.replace(/-/g, '').slice(-4));
  });

  it('cada proveedor ve solo SUS productos (y no los archivados)', async () => {
    const view1 = await service.getSupplierPortalView(code1);
    expect(view1?.supplier.name).toBe('Distribuidora Uno SpA');
    expect(view1?.rows.map((row) => row.sku).sort()).toEqual(['P1', 'P2']);

    const view2 = await service.getSupplierPortalView(code2);
    expect(view2?.rows.map((row) => row.sku).sort()).toEqual(['P1', 'P3']);
  });

  it('acepta el código como lo escribe una persona (minúsculas, sin guiones)', async () => {
    const typed = code1.replace(/-/g, ' ').toLowerCase();
    expect((await service.getSupplierPortalView(typed))?.supplier.name).toBe('Distribuidora Uno SpA');
  });

  it('un código inventado, mal formado o vacío no muestra nada', async () => {
    expect(await service.getSupplierPortalView('0000-0000-0000-0000')).toBeNull();
    expect(await service.getSupplierPortalView('ABC')).toBeNull();
    expect(await service.getSupplierPortalView('')).toBeNull();
    expect(await service.getSupplierPortalView('un código con ñ y espacios!!')).toBeNull();
  });

  it('muestra el stock total y por bodega, separado, y el estado frente al mínimo', async () => {
    const view = (await service.getSupplierPortalView(code1))!;
    const aceite = view.rows.find((row) => row.sku === 'P1')!;
    expect(aceite).toMatchObject({ total: 15, status: 'LOW', minStock: 20, name: 'Aceite Uno', brand: 'Chef' });
    expect(aceite.byWarehouse).toEqual([
      { warehouse: 'Central', quantity: 12 },
      { warehouse: 'Sucursal', quantity: 3 },
    ]);
    expect(view.rows.find((row) => row.sku === 'P2')).toMatchObject({ total: 0, status: 'OUT' });
    expect(view.summary).toEqual({ products: 2, out: 1, low: 1 });
  });

  it('nunca expone costos, precios, ni datos internos', async () => {
    const text = JSON.stringify(await service.getSupplierPortalView(code1));
    for (const forbidden of ['costPricePMP', 'netPrice', 'grossPrice', '777', '1990', '2368', 'unitCost', 'companyId', ids.companyA, ids.s1, ids.p1, 'passwordHash']) {
      expect(text).not.toContain(forbidden);
    }
  });

  describe('llegadas y salidas', () => {
    beforeAll(async () => {
      const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60_000);
      // Llegadas: la del proveedor 1 y una más reciente del proveedor 2 para el mismo producto.
      await movement({ companyId: ids.companyA, productId: ids.p1, warehouseId: ids.whCentral, type: 'PURCHASE_IN', quantity: 40, supplierId: ids.s1, createdAt: days(10) });
      await movement({ companyId: ids.companyA, productId: ids.p1, warehouseId: ids.whCentral, type: 'PURCHASE_IN', quantity: 8, supplierId: ids.s1, createdAt: days(4) });
      await movement({ companyId: ids.companyA, productId: ids.p1, warehouseId: ids.whCentral, type: 'PURCHASE_IN', quantity: 500, supplierId: ids.s2, createdAt: days(1) });
      // Salidas: 30 vendidas y 5 de merma dentro de la ventana; una venta vieja que NO cuenta.
      await movement({ companyId: ids.companyA, productId: ids.p1, warehouseId: ids.whCentral, type: 'SALE_OUT', quantity: 20, createdAt: days(3) });
      await movement({ companyId: ids.companyA, productId: ids.p1, warehouseId: ids.whSucursal, type: 'SALE_OUT', quantity: 10, createdAt: days(8) });
      await movement({ companyId: ids.companyA, productId: ids.p1, warehouseId: ids.whCentral, type: 'ADJUSTMENT_OUT', quantity: 5, createdAt: days(2) });
      await movement({ companyId: ids.companyA, productId: ids.p1, warehouseId: ids.whCentral, type: 'SALE_OUT', quantity: 1000, createdAt: days(45) });
    });

    it('la última llegada es la de ESTE proveedor, no la de otro que surte lo mismo', async () => {
      const view1 = (await service.getSupplierPortalView(code1))!;
      expect(view1.rows.find((row) => row.sku === 'P1')).toMatchObject({ lastReceivedQty: 8 });
      const view2 = (await service.getSupplierPortalView(code2))!;
      expect(view2.rows.find((row) => row.sku === 'P1')).toMatchObject({ lastReceivedQty: 500 });
    });

    it('cuenta ventas y bajas de los últimos 30 días y calcula cuántos días alcanza el stock', async () => {
      const row = (await service.getSupplierPortalView(code1))!.rows.find((r) => r.sku === 'P1')!;
      expect(row.sold30).toBe(30);
      expect(row.written30).toBe(5);
      // 15 en stock al ritmo de 30 por 30 días = 1 por día → 15 días.
      expect(row.coverageDays).toBe(15);
    });

    it('sin ventas no hay cobertura: no se inventa un número', async () => {
      const row = (await service.getSupplierPortalView(code1))!.rows.find((r) => r.sku === 'P2')!;
      expect(row).toMatchObject({ sold30: 0, written30: 0, coverageDays: null });
    });

    it('si la empresa no comparte el movimiento, el proveedor ve solo existencias', async () => {
      await service.setSupplierPortalMovement(ids.companyA, ids.s1, false);
      try {
        const view = (await service.getSupplierPortalView(code1))!;
        expect(view.showMovement).toBe(false);
        for (const row of view.rows) expect(row).toMatchObject({ sold30: null, written30: null, coverageDays: null });
        expect(view.rows.find((row) => row.sku === 'P1')!.total).toBe(15);
      } finally {
        await service.setSupplierPortalMovement(ids.companyA, ids.s1, true);
      }
    });
  });

  describe('control del acceso', () => {
    it('generar un código nuevo invalida el anterior al instante', async () => {
      const { code } = await service.generateSupplierPortalCode(ids.companyA, ids.s2, ids.user);
      expect(code).not.toBe(code2);
      expect(await service.getSupplierPortalView(code2)).toBeNull();
      expect((await service.getSupplierPortalView(code))?.supplier.name).toBe('Importadora Dos Ltda');
      code2 = code;
    });

    it('revocar el acceso lo deja sin efecto, y se puede volver a generar', async () => {
      await service.revokeSupplierPortalAccess(ids.companyA, ids.s2);
      expect(await service.getSupplierPortalView(code2)).toBeNull();
      expect((await service.getSupplierPortalAdmin(ids.companyA, ids.s2)).access).toBeNull();
      code2 = (await service.generateSupplierPortalCode(ids.companyA, ids.s2, ids.user)).code;
      expect(await service.getSupplierPortalView(code2)).not.toBeNull();
    });

    it('una empresa suspendida o sin inventario no muestra el portal', async () => {
      await prisma.company.update({ where: { id: ids.companyA }, data: { status: 'SUSPENDED' } });
      expect(await service.getSupplierPortalView(code1)).toBeNull();
      await prisma.company.update({ where: { id: ids.companyA }, data: { status: 'TRIAL' } });
      expect(await service.getSupplierPortalView(code1)).not.toBeNull();
      await prisma.company.update({ where: { id: ids.companyA }, data: { status: 'ACTIVE' } });

      await prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasInventory: false } });
      expect(await service.getSupplierPortalView(code1)).toBeNull();
      await prisma.companyFeatures.update({ where: { companyId: ids.companyA }, data: { hasInventory: true } });
      expect(await service.getSupplierPortalView(code1)).not.toBeNull();
    });

    it('una empresa sin fila de módulos se trata con los valores predeterminados (el inventario viene activo)', async () => {
      const features = await prisma.companyFeatures.findUniqueOrThrow({ where: { companyId: ids.companyA } });
      await prisma.companyFeatures.delete({ where: { companyId: ids.companyA } });
      try {
        expect(await service.getSupplierPortalView(code1)).not.toBeNull();
      } finally {
        const { id: _id, companyId: _companyId, ...rest } = features;
        await prisma.companyFeatures.create({ data: { companyId: ids.companyA, ...rest } });
      }
    });

    it('anota el último uso sin escribir en cada vista', async () => {
      await prisma.supplierPortalAccess.updateMany({ where: { contactId: ids.s1 }, data: { lastUsedAt: null } });
      await service.getSupplierPortalView(code1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const first = (await prisma.supplierPortalAccess.findFirstOrThrow({ where: { contactId: ids.s1 } })).lastUsedAt;
      expect(first).toBeInstanceOf(Date);
      await service.getSupplierPortalView(code1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect((await prisma.supplierPortalAccess.findFirstOrThrow({ where: { contactId: ids.s1 } })).lastUsedAt?.getTime()).toBe(first!.getTime());
    });

    it('solo se genera un código para un proveedor de la propia empresa', async () => {
      await expect(service.generateSupplierPortalCode(ids.companyA, ids.notSupplier, ids.user)).rejects.toThrow('proveedor');
      await expect(service.generateSupplierPortalCode(ids.companyA, ids.sB, ids.user)).rejects.toThrow('proveedor');
      await expect(service.generateSupplierPortalCode(ids.companyB, ids.s1, ids.user)).rejects.toThrow('proveedor');
      expect(await prisma.supplierPortalAccess.count({ where: { contactId: { in: [ids.notSupplier, ids.sB] } } })).toBe(0);
    });

    it('no se puede revocar ni cambiar el acceso de un proveedor de otra empresa', async () => {
      await expect(service.revokeSupplierPortalAccess(ids.companyB, ids.s1)).rejects.toThrow();
      await expect(service.setSupplierPortalMovement(ids.companyB, ids.s1, false)).rejects.toThrow();
      expect(await service.getSupplierPortalView(code1)).not.toBeNull();
      expect((await prisma.supplierPortalAccess.findFirstOrThrow({ where: { contactId: ids.s1 } })).showMovement).toBe(true);
    });
  });

  describe('productos de cada proveedor', () => {
    it('agregar y quitar un producto cambia lo que ve el proveedor', async () => {
      await service.linkSupplierProduct(ids.companyA, ids.s1, ids.p3);
      expect((await service.getSupplierPortalView(code1))!.rows.map((row) => row.sku).sort()).toEqual(['P1', 'P2', 'P3']);
      await service.unlinkSupplierProduct(ids.companyA, ids.s1, ids.p3);
      expect((await service.getSupplierPortalView(code1))!.rows.map((row) => row.sku).sort()).toEqual(['P1', 'P2']);
    });

    it('agregar dos veces el mismo producto no lo duplica', async () => {
      await service.linkSupplierProduct(ids.companyA, ids.s1, ids.p2);
      await service.linkSupplierProduct(ids.companyA, ids.s1, ids.p2);
      expect(await prisma.productSupplier.count({ where: { supplierId: ids.s1, productId: ids.p2 } })).toBe(1);
    });

    it('no se puede ligar un producto de otra empresa ni a un contacto de otra empresa', async () => {
      await expect(service.linkSupplierProduct(ids.companyA, ids.s1, ids.pB)).rejects.toThrow('Producto no encontrado');
      await expect(service.linkSupplierProduct(ids.companyA, ids.sB, ids.p1)).rejects.toThrow('proveedor');
      expect(await prisma.productSupplier.count({ where: { OR: [{ productId: ids.pB }, { supplierId: ids.sB }] } })).toBe(0);
    });

    it('quitar un producto con el id de otra empresa no borra nada', async () => {
      await service.unlinkSupplierProduct(ids.companyB, ids.s1, ids.p1);
      expect(await prisma.productSupplier.count({ where: { supplierId: ids.s1, productId: ids.p1 } })).toBe(1);
    });

    it('la búsqueda para agregar excluye lo ya agregado y lo de otras empresas', async () => {
      const found = await service.searchLinkableProducts(ids.companyA, ids.s1, 'o');
      expect(found).toEqual([]); // menos de 2 letras: no busca
      const byName = await service.searchLinkableProducts(ids.companyA, ids.s1, 'Fideos');
      expect(byName.map((row) => row.sku)).toEqual(['P3']);
      const already = await service.searchLinkableProducts(ids.companyA, ids.s1, 'Aceite');
      expect(already).toEqual([]);
      const foreign = await service.searchLinkableProducts(ids.companyA, ids.s1, 'empresa B');
      expect(foreign).toEqual([]);
    });

    it('el panel de la empresa lista los productos con su stock actual', async () => {
      const admin = await service.getSupplierPortalAdmin(ids.companyA, ids.s1);
      expect(admin.access).toMatchObject({ showMovement: true });
      expect(admin.products.find((product) => product.sku === 'P1')).toMatchObject({ stock: 15, name: 'Aceite Uno' });
    });
  });
});

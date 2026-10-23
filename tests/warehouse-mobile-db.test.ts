/**
 * Pruebas de integración de la app del bodeguero contra una base PostgreSQL REAL.
 *
 * No corren en `npm test` normal: necesitan una base desechable. Para correrlas:
 *
 *   WAREHOUSE_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/warehouse-mobile-db.test.ts
 *
 * La base debe tener las migraciones aplicadas (`prisma migrate deploy`). Por
 * seguridad (la base del `.env` del proyecto ES la de producción, ver CLAUDE.md §5)
 * la prueba SE NIEGA a correr si el servidor no es local o si el nombre de la base
 * no termina en `_test`: crea y borra empresas, productos y movimientos.
 */
import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

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
const visionRead = jest.fn();
jest.mock('@/modules/warehouse-mobile/services/vision.service', () => {
  class VisionRateLimitedError extends Error {}
  class VisionUnavailableError extends Error {}
  return {
    VisionRateLimitedError,
    VisionUnavailableError,
    visionConfigured: () => true,
    visionModel: () => 'modelo-de-prueba',
    readProductPhoto: (...args: unknown[]) => visionRead(...args),
  };
});

describeDb('app del bodeguero contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let processOperations: typeof import('@/modules/warehouse-mobile/services/sync.service').processOperations;
  let identifyPhoto: typeof import('@/modules/warehouse-mobile/services/identify.service').identifyPhoto;
  let findByCode: typeof import('@/modules/warehouse-mobile/services/catalog.service').findByCode;

  const suffix = Math.random().toString(36).slice(2, 8);
  let companyA = '';
  let companyB = '';
  let companyC = '';
  let productC = '';
  let whA1 = '';
  let whA2 = '';
  let whB1 = '';
  let productA = '';
  let productB = '';
  let operator1 = '';
  let operator2 = '';
  let supplierA1 = '';
  let supplierA2 = '';
  let notSupplierA = '';
  let supplierB = '';

  /** Foto de respaldo como la deja `/api/bodega/evidence`: en la carpeta de la empresa. */
  const evidenceFor = (companyId: string, name = 'foto') => `https://abc123.public.blob.vercel-storage.com/inventory-evidence/${companyId}/bodega-${name}-${suffix}.jpg`;

  const actor = (companyId: string, overrides: Partial<import('@/modules/warehouse-mobile/services/sync.service').SyncActor> = {}) => ({
    companyId,
    userId: operator1,
    userEmail: 'bodega@test.cl',
    canMove: true,
    canCreateProduct: true,
    canSeeCosts: true,
    ...overrides,
  });

  let opCounter = 0;
  const opId = () => `op-${suffix}-${++opCounter}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    // Sin esto Prisma imprime cada consulta (`log: ['query']` fuera de producción) y tapa el resultado.
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    ({ processOperations } = await import('@/modules/warehouse-mobile/services/sync.service'));
    ({ identifyPhoto } = await import('@/modules/warehouse-mobile/services/identify.service'));
    ({ findByCode } = await import('@/modules/warehouse-mobile/services/catalog.service'));

    const a = await prisma.company.create({ data: { rut: `76${suffix}1-1`, businessName: `Bodega Test A ${suffix}` } });
    const b = await prisma.company.create({ data: { rut: `76${suffix}2-2`, businessName: `Bodega Test B ${suffix}` } });
    const c = await prisma.company.create({ data: { rut: `76${suffix}3-3`, businessName: `Bodega Test C ${suffix}` } });
    companyA = a.id;
    companyB = b.id;
    companyC = c.id;
    whA1 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Central', code: 'CEN', isDefault: true } })).id;
    whA2 = (await prisma.warehouse.create({ data: { companyId: companyA, name: 'Sucursal', code: 'SUC' } })).id;
    whB1 = (await prisma.warehouse.create({ data: { companyId: companyB, name: 'Central B', code: 'CEN' } })).id;
    productA = (await prisma.product.create({ data: { companyId: companyA, sku: 'ACE-900', name: 'Aceite Maravilla Chef 900 ml', brand: 'Chef', barcode: '4006381333931', costPricePMP: 1000, netPrice: 1500, grossPrice: 1785 } })).id;
    productC = (await prisma.product.create({ data: { companyId: companyC, sku: 'ACE-900', name: 'Aceite Maravilla Chef 900 ml', brand: 'Chef', barcode: '4006381333931', netPrice: 1500, grossPrice: 1785 } })).id;
    await prisma.warehouse.create({ data: { companyId: companyC, name: 'Central C', code: 'CEN', isDefault: true } });
    productB = (await prisma.product.create({ data: { companyId: companyB, sku: 'ACE-900', name: 'Producto de otra empresa', netPrice: 100, grossPrice: 119 } })).id;

    const user = (name: string, n: number) => prisma.user.create({ data: { email: `operario${n}-${suffix}@test.cl`, passwordHash: 'x', name, companyId: companyA, role: 'WAREHOUSE' } });
    operator1 = (await user('Operaria Uno', 1)).id;
    operator2 = (await user('Operario Dos', 2)).id;
    const contact = (companyId: string, razonSocial: string, rut: string, isSupplier: boolean) =>
      prisma.contact.create({ data: { companyId, razonSocial, rut, rutClean: rut.replace(/[.-]/g, ''), isSupplier, isCustomer: !isSupplier } });
    supplierA1 = (await contact(companyA, 'Distribuidora Uno SpA', `77.${suffix.slice(0, 3)}.001-1`, true)).id;
    supplierA2 = (await contact(companyA, 'Importadora Dos Ltda', `77.${suffix.slice(0, 3)}.002-2`, true)).id;
    notSupplierA = (await contact(companyA, 'Cliente Que No Es Proveedor', `77.${suffix.slice(0, 3)}.003-3`, false)).id;
    supplierB = (await contact(companyB, 'Proveedor De Otra Empresa', `77.${suffix.slice(0, 3)}.004-4`, true)).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [companyA, companyB, companyC].filter(Boolean)) {
      await prisma.warehouseMobileOp.deleteMany({ where: { companyId } });
      await prisma.productPhotoScan.deleteMany({ where: { companyId } });
      await prisma.journalEntry?.deleteMany?.({ where: { companyId } }).catch(() => undefined);
      await prisma.inventoryLot.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.stock.deleteMany({ where: { companyId } });
      await prisma.productSupplier.deleteMany({ where: { companyId } });
      await prisma.supplierPortalAccess.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.category.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  });

  const stockOf = async (companyId: string, productId: string, warehouseId: string) =>
    (await prisma.stock.findUnique({ where: { companyId_productId_warehouseId: { companyId, productId, warehouseId } } }))?.quantity ?? 0;

  describe('movimientos', () => {
    it('una llegada suma al stock, entra al PMP vigente y deja registro en el kardex', async () => {
      const [result] = await processOperations(actor(companyA), [
        { kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 10, reference: 'GD 4521' },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED', newStock: 10, replayed: false, createdProduct: false });
      expect(await stockOf(companyA, productA, whA1)).toBe(10);

      const movement = await prisma.inventoryMovement.findFirst({ where: { companyId: companyA, productId: productA }, orderBy: { createdAt: 'desc' } });
      expect(movement).toMatchObject({ type: 'PURCHASE_IN', quantity: 10, unitCost: 1000, newPmp: 1000, reference: 'GD 4521' });
      expect(movement?.notes).toContain('App bodega · Llegada de mercadería');
    });

    it('reenviar la misma operación NO mueve el stock otra vez (idempotencia)', async () => {
      const op = { kind: 'MOVE' as const, clientOpId: opId(), mode: 'RECEIVE' as const, productId: productA, warehouseId: whA1, quantity: 5 };
      const before = await stockOf(companyA, productA, whA1);
      const [first] = await processOperations(actor(companyA), [op]);
      const [second] = await processOperations(actor(companyA), [op]);
      expect(first).toMatchObject({ status: 'APPLIED', replayed: false });
      expect(second).toMatchObject({ status: 'APPLIED', replayed: true, newStock: before + 5 });
      expect(await stockOf(companyA, productA, whA1)).toBe(before + 5);
    });

    it('dos envíos simultáneos de la misma operación se aplican una sola vez', async () => {
      const op = { kind: 'MOVE' as const, clientOpId: opId(), mode: 'RECEIVE' as const, productId: productA, warehouseId: whA1, quantity: 3 };
      const before = await stockOf(companyA, productA, whA1);
      const results = await Promise.all([processOperations(actor(companyA), [op]), processOperations(actor(companyA), [op]), processOperations(actor(companyA), [op])]);
      const statuses = results.map(([r]) => r!.status);
      expect(statuses.every((status) => status === 'APPLIED')).toBe(true);
      expect(results.filter(([r]) => r!.status === 'APPLIED' && !r!.replayed)).toHaveLength(1);
      expect(await stockOf(companyA, productA, whA1)).toBe(before + 3);
    });

    it('una merma descuenta; si no alcanza, se rechaza sin guardar y el mismo envío funciona al llegar stock', async () => {
      const current = await stockOf(companyA, productA, whA1);
      const waste = { kind: 'MOVE' as const, clientOpId: opId(), mode: 'WASTE' as const, reason: 'EXPIRED' as const, evidenceUrl: evidenceFor(companyA, 'merma'), productId: productA, warehouseId: whA1, quantity: current + 100 };

      const [rejected] = await processOperations(actor(companyA), [waste]);
      expect(rejected).toMatchObject({ status: 'REJECTED', code: 'INSUFFICIENT_STOCK' });
      expect(await stockOf(companyA, productA, whA1)).toBe(current);
      expect(await prisma.warehouseMobileOp.count({ where: { companyId: companyA, clientOpId: waste.clientOpId } })).toBe(0);

      await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 100 }]);
      const [accepted] = await processOperations(actor(companyA), [waste]);
      expect(accepted).toMatchObject({ status: 'APPLIED', newStock: 0 });

      const movement = await prisma.inventoryMovement.findFirst({ where: { companyId: companyA, type: 'ADJUSTMENT_OUT' }, orderBy: { createdAt: 'desc' } });
      expect(movement?.notes).toContain('Salida o merma · Vencido');
    });

    it('un traslado saca de una bodega y entra a la otra', async () => {
      await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 20 }]);
      const origin = await stockOf(companyA, productA, whA1);
      const [result] = await processOperations(actor(companyA), [
        { kind: 'MOVE', clientOpId: opId(), mode: 'TRANSFER', productId: productA, warehouseId: whA1, targetWarehouseId: whA2, quantity: 8 },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED', newStock: origin - 8 });
      expect(await stockOf(companyA, productA, whA2)).toBe(8);
    });

    it('sin permiso de costos, el costo que mande el celular se ignora', async () => {
      const [result] = await processOperations(actor(companyA, { canSeeCosts: false }), [
        { kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 1, unitCost: 1 },
      ]);
      expect(result?.status).toBe('APPLIED');
      const product = await prisma.product.findUnique({ where: { id: productA } });
      expect(product?.costPricePMP).toBe(1000);
    });

    it('sin permiso de movimientos, se rechaza', async () => {
      const [result] = await processOperations(actor(companyA, { canMove: false }), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 1 }]);
      expect(result).toMatchObject({ status: 'REJECTED', code: 'FORBIDDEN' });
    });
  });

  describe('proveedor de cada ingreso', () => {
    it('la llegada anota el proveedor y el operario, y deja al proveedor surtiendo ese producto', async () => {
      const [result] = await processOperations(actor(companyA, { userId: operator1 }), [
        { kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 6, supplierId: supplierA1 },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED' });
      const movement = await prisma.inventoryMovement.findFirst({ where: { companyId: companyA, productId: productA, supplierId: supplierA1 }, orderBy: { createdAt: 'desc' } });
      expect(movement).toMatchObject({ type: 'PURCHASE_IN', quantity: 6, userId: operator1, supplierId: supplierA1, warehouseId: whA1 });

      const link = await prisma.productSupplier.findUnique({ where: { productId_supplierId: { productId: productA, supplierId: supplierA1 } } });
      expect(link).toMatchObject({ companyId: companyA });
      expect(link?.lastReceivedAt).toBeInstanceOf(Date);
    });

    it('otra llegada del mismo proveedor actualiza la fecha y NO duplica el vínculo', async () => {
      const first = await prisma.productSupplier.findUniqueOrThrow({ where: { productId_supplierId: { productId: productA, supplierId: supplierA1 } } });
      await new Promise((resolve) => setTimeout(resolve, 15));
      await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 1, supplierId: supplierA1 }]);
      const links = await prisma.productSupplier.findMany({ where: { productId: productA, supplierId: supplierA1 } });
      expect(links).toHaveLength(1);
      expect(links[0]!.lastReceivedAt!.getTime()).toBeGreaterThan(first.lastReceivedAt!.getTime());
    });

    it('un producto puede tener más de un proveedor', async () => {
      await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 2, supplierId: supplierA2 }]);
      const suppliers = await prisma.productSupplier.findMany({ where: { productId: productA }, select: { supplierId: true } });
      expect(suppliers.map((row) => row.supplierId).sort()).toEqual([supplierA1, supplierA2].sort());
    });

    it('el proveedor de otra empresa, o un contacto que no es proveedor, se rechazan sin mover el stock', async () => {
      const before = await stockOf(companyA, productA, whA1);
      for (const supplierId of [supplierB, notSupplierA, 'no-existe-123']) {
        const [result] = await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 5, supplierId }]);
        expect(result).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
      }
      expect(await stockOf(companyA, productA, whA1)).toBe(before);
      expect(await prisma.productSupplier.count({ where: { supplierId: { in: [supplierB, notSupplierA] } } })).toBe(0);
    });

    it('un producto nuevo creado en una llegada queda ligado a su proveedor', async () => {
      const [result] = await processOperations(actor(companyA, { userId: operator2 }), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 12, supplierId: supplierA2, product: { name: `Galletas Prueba ${suffix}`, brand: 'Costa', sku: `GAL-${suffix}`, unit: 'UN' } },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED', createdProduct: true });
      if (result?.status !== 'APPLIED') throw new Error('no se aplicó');
      const link = await prisma.productSupplier.findUnique({ where: { productId_supplierId: { productId: result.productId, supplierId: supplierA2 } } });
      expect(link).not.toBeNull();
      const movement = await prisma.inventoryMovement.findFirst({ where: { productId: result.productId } });
      expect(movement).toMatchObject({ supplierId: supplierA2, userId: operator2, quantity: 12 });
    });

    it('si el código de barras ya existe, se suma al producto existente y también queda ligado al proveedor', async () => {
      const [result] = await processOperations(actor(companyA), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 4, supplierId: supplierA2, product: { name: 'Lo que la foto dijo', barcode: '4006381333931', unit: 'UN' } },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED', mergedIntoExisting: true, productId: productA });
      expect(await prisma.productSupplier.count({ where: { productId: productA, supplierId: supplierA2 } })).toBe(1);
    });

    it('una salida o un traslado NO anotan proveedor aunque venga en la operación', async () => {
      await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 30 }]);
      const [result] = await processOperations(actor(companyA), [
        { kind: 'MOVE', clientOpId: opId(), mode: 'TRANSFER', productId: productA, warehouseId: whA1, targetWarehouseId: whA2, quantity: 1, supplierId: supplierA1 },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED' });
      const movements = await prisma.inventoryMovement.findMany({ where: { companyId: companyA, type: 'TRANSFER' }, orderBy: { createdAt: 'desc' }, take: 2 });
      expect(movements.every((movement) => movement.supplierId === null)).toBe(true);
    });
  });

  describe('salidas con motivo, foto y operario', () => {
    const waste = (overrides: Record<string, unknown> = {}) => ({
      kind: 'MOVE' as const,
      clientOpId: opId(),
      mode: 'WASTE' as const,
      reason: 'DAMAGED' as const,
      productId: productA,
      warehouseId: whA1,
      quantity: 1,
      evidenceUrl: evidenceFor(companyA, 'dano'),
      ...overrides,
    });

    beforeAll(async () => {
      await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 50 }]);
      await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whA2, quantity: 20 }]);
    });

    it('queda en el movimiento el motivo, la foto, la bodega y quién lo hizo', async () => {
      const op = waste({ reason: 'TASTING', note: 'degustación en feria', evidenceUrl: evidenceFor(companyA, 'degustacion') });
      const [result] = await processOperations(actor(companyA, { userId: operator2 }), [op]);
      expect(result).toMatchObject({ status: 'APPLIED' });
      const movement = await prisma.inventoryMovement.findFirst({ where: { companyId: companyA, reasonCode: 'TASTING' } });
      expect(movement).toMatchObject({
        type: 'ADJUSTMENT_OUT',
        quantity: 1,
        warehouseId: whA1,
        userId: operator2,
        reasonCode: 'TASTING',
        evidenceUrl: evidenceFor(companyA, 'degustacion'),
      });
      expect(movement?.notes).toContain('Degustación o muestra');
      expect(movement?.notes).toContain('degustación en feria');
    });

    it('cada operario queda identificado en lo que ajustó', async () => {
      await processOperations(actor(companyA, { userId: operator1 }), [waste({ reason: 'EXPIRED' })]);
      await processOperations(actor(companyA, { userId: operator2 }), [waste({ reason: 'SHRINKAGE' })]);
      const byReason = async (reasonCode: string) => (await prisma.inventoryMovement.findFirst({ where: { companyId: companyA, reasonCode }, orderBy: { createdAt: 'desc' } }))?.userId;
      expect(await byReason('EXPIRED')).toBe(operator1);
      expect(await byReason('SHRINKAGE')).toBe(operator2);
    });

    it('una salida sin foto, o con una foto que no es de la carpeta de esta empresa, se rechaza sin tocar el stock', async () => {
      const before = await stockOf(companyA, productA, whA1);
      const [noPhoto] = await processOperations(actor(companyA), [waste({ evidenceUrl: undefined })]);
      expect(noPhoto).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
      const [otherCompany] = await processOperations(actor(companyA), [waste({ evidenceUrl: evidenceFor(companyB) })]);
      expect(otherCompany).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
      const [otherFolder] = await processOperations(actor(companyA), [waste({ evidenceUrl: `https://abc123.public.blob.vercel-storage.com/products/${companyA}/foto.jpg` })]);
      expect(otherFolder).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
      const [foreignHost] = await processOperations(actor(companyA), [waste({ evidenceUrl: `https://evil.example.com/inventory-evidence/${companyA}/foto.jpg` })]);
      expect(foreignHost).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
      expect(await stockOf(companyA, productA, whA1)).toBe(before);
    });

    it('"Otro motivo" sin explicación se rechaza; con explicación se registra', async () => {
      const [bare] = await processOperations(actor(companyA), [waste({ reason: 'OTHER' })]);
      expect(bare).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
      const [explained] = await processOperations(actor(companyA), [waste({ reason: 'OTHER', note: 'Se cayó del camión' })]);
      expect(explained).toMatchObject({ status: 'APPLIED' });
    });

    it('cada salida descuenta de SU bodega: las bodegas no se mezclan', async () => {
      const central = await stockOf(companyA, productA, whA1);
      const branch = await stockOf(companyA, productA, whA2);
      await processOperations(actor(companyA), [waste({ warehouseId: whA2, quantity: 3, reason: 'DONATION' })]);
      expect(await stockOf(companyA, productA, whA2)).toBe(branch - 3);
      expect(await stockOf(companyA, productA, whA1)).toBe(central);
      const movement = await prisma.inventoryMovement.findFirst({ where: { companyId: companyA, reasonCode: 'DONATION' } });
      expect(movement?.warehouseId).toBe(whA2);
    });

    it('un traslado deja a la misma persona en la salida y en la entrada, cada una en su bodega', async () => {
      const [result] = await processOperations(actor(companyA, { userId: operator1 }), [
        { kind: 'MOVE', clientOpId: opId(), mode: 'TRANSFER', productId: productA, warehouseId: whA1, targetWarehouseId: whA2, quantity: 2, evidenceUrl: evidenceFor(companyA, 'traslado') },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED' });
      const moves = await prisma.inventoryMovement.findMany({ where: { companyId: companyA, type: 'TRANSFER', evidenceUrl: evidenceFor(companyA, 'traslado') } });
      expect(moves.map((move) => move.warehouseId).sort()).toEqual([whA1, whA2].sort());
      expect(moves.every((move) => move.userId === operator1)).toBe(true);
    });

    it('un reenvío de la misma salida no la duplica ni cambia a quien la hizo', async () => {
      const op = waste({ reason: 'LOST' });
      const before = await stockOf(companyA, productA, whA1);
      await processOperations(actor(companyA, { userId: operator1 }), [op]);
      const [again] = await processOperations(actor(companyA, { userId: operator2 }), [op]);
      expect(again).toMatchObject({ status: 'APPLIED', replayed: true });
      expect(await stockOf(companyA, productA, whA1)).toBe(before - 1);
      expect(await prisma.inventoryMovement.count({ where: { companyId: companyA, reasonCode: 'LOST' } })).toBe(1);
    });
  });

  describe('aislamiento entre empresas', () => {
    it('no se puede mover el producto ni usar la bodega de otra empresa', async () => {
      const [otherProduct, otherWarehouse] = await processOperations(actor(companyA), [
        { kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productB, warehouseId: whA1, quantity: 5 },
        { kind: 'MOVE', clientOpId: opId(), mode: 'RECEIVE', productId: productA, warehouseId: whB1, quantity: 5 },
      ]);
      expect(otherProduct).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
      expect(otherWarehouse).toMatchObject({ status: 'REJECTED', code: 'NOT_FOUND' });
      expect(await stockOf(companyB, productB, whA1)).toBe(0);
    });

    it('la clave de una empresa no choca con la misma clave de otra', async () => {
      const clientOpId = opId();
      const [a] = await processOperations(actor(companyA), [{ kind: 'MOVE', clientOpId, mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 1 }]);
      const [b] = await processOperations(actor(companyB), [{ kind: 'MOVE', clientOpId, mode: 'RECEIVE', productId: productB, warehouseId: whB1, quantity: 7 }]);
      expect(a).toMatchObject({ status: 'APPLIED', replayed: false });
      expect(b).toMatchObject({ status: 'APPLIED', replayed: false, newStock: 7 });
    });

    it('la búsqueda por código solo ve el catálogo de la propia empresa', async () => {
      expect(await findByCode(companyA, '4006381333931')).toMatchObject({ id: productA, reason: 'barcode' });
      expect(await findByCode(companyB, '4006381333931')).toBeNull();
      // Un UPC-A sin el cero adelante encuentra el EAN-13 con cero.
      await prisma.product.update({ where: { id: productB }, data: { barcode: '0036000291452' } });
      expect(await findByCode(companyB, '036000291452')).toMatchObject({ id: productB });
    });
  });

  describe('producto nuevo', () => {
    it('crea el producto con SKU automático, su foto y su primera entrada', async () => {
      const [result] = await processOperations(actor(companyA), [
        {
          kind: 'CREATE_PRODUCT',
          clientOpId: opId(),
          mode: 'RECEIVE',
          warehouseId: whA1,
          quantity: 12,
          unitCost: 800,
          product: { name: 'Fideos Espagueti Carozzi 400 g', brand: 'Carozzi', unit: 'UN', categoryName: 'Abarrotes', barcode: '7801234567890', netPrice: 1200 },
        },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED', createdProduct: true, mergedIntoExisting: false, newStock: 12, sku: 'PRD-000001' });

      const created = await prisma.product.findFirst({ where: { companyId: companyA, sku: 'PRD-000001' }, include: { category: true } });
      expect(created).toMatchObject({ name: 'Fideos Espagueti Carozzi 400 g', barcode: '7801234567890', netPrice: 1200, grossPrice: 1428, costPricePMP: 800 });
      expect(created?.category?.name).toBe('Abarrotes');
    });

    it('el siguiente producto sin SKU toma el número siguiente, aunque lleguen juntos', async () => {
      const results = await Promise.all(
        ['Arroz Grado 1 Tucapel 1 kg', 'Azúcar Flor Iansa 1 kg', 'Sal de Mar Lobos 500 g'].map((name) =>
          processOperations(actor(companyA), [{ kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 1, product: { name, unit: 'UN' } }])
        )
      );
      const skus = results.map(([r]) => (r?.status === 'APPLIED' ? r.sku : r?.status));
      // Una colisión se reintenta sola: nunca se aceptan dos productos con el mismo SKU.
      const applied = skus.filter((sku) => String(sku).startsWith('PRD-'));
      expect(new Set(applied).size).toBe(applied.length);
      for (const [r] of results) expect(['APPLIED', 'RETRY']).toContain(r?.status);
    });

    it('un producto con el mismo código de barras se suma al existente en vez de duplicarse', async () => {
      const before = await stockOf(companyA, productA, whA1);
      const [result] = await processOperations(actor(companyA), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 4, product: { name: 'Aceite de maravilla', barcode: '4006381333931', unit: 'UN' } },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED', mergedIntoExisting: true, createdProduct: false, productId: productA });
      expect(await stockOf(companyA, productA, whA1)).toBe(before + 4);
    });

    it('un nombre y marca que ya existen piden decidir; confirmando que es otro, se crea', async () => {
      const draft = { name: 'Aceite Maravilla Chef 900 ml', brand: 'Chef', unit: 'UN' as const };
      const [duplicate] = await processOperations(actor(companyA), [{ kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 1, product: draft }]);
      expect(duplicate).toMatchObject({ status: 'REJECTED', code: 'DUPLICATE_PRODUCT' });
      expect(duplicate?.status === 'REJECTED' && duplicate.existing?.id).toBe(productA);

      const [forced] = await processOperations(actor(companyA), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 1, confirmDistinct: true, product: draft },
      ]);
      expect(forced).toMatchObject({ status: 'APPLIED', createdProduct: true });
    });

    it('otro tamaño del mismo producto NO cuenta como duplicado', async () => {
      const [result] = await processOperations(actor(companyA), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 1, product: { name: 'Aceite Maravilla Chef 5 L', brand: 'Chef', unit: 'UN' } },
      ]);
      expect(result).toMatchObject({ status: 'APPLIED', createdProduct: true });
    });

    it('un SKU escrito que ya existe se rechaza mostrando el producto', async () => {
      const [result] = await processOperations(actor(companyA), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 1, product: { name: 'Otra cosa distinta', sku: 'ace-900', unit: 'UN' } },
      ]);
      expect(result).toMatchObject({ status: 'REJECTED', code: 'SKU_TAKEN' });
    });

    it('rechaza una foto que no es de la empresa y a quien no puede crear productos', async () => {
      const [foreignPhoto] = await processOperations(actor(companyA), [
        {
          kind: 'CREATE_PRODUCT',
          clientOpId: opId(),
          mode: 'RECEIVE',
          warehouseId: whA1,
          quantity: 1,
          product: { name: 'Producto con foto ajena', unit: 'UN', imageUrl: 'https://evil.example.com/products/x.jpg' },
        },
      ]);
      expect(foreignPhoto).toMatchObject({ status: 'REJECTED', code: 'INVALID' });

      const [forbidden] = await processOperations(actor(companyA, { canCreateProduct: false }), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whA1, quantity: 1, product: { name: 'Producto sin permiso', unit: 'UN' } },
      ]);
      expect(forbidden).toMatchObject({ status: 'REJECTED', code: 'FORBIDDEN' });
    });

    it('si la entrada falla, el producto tampoco queda creado', async () => {
      const [result] = await processOperations(actor(companyA), [
        { kind: 'CREATE_PRODUCT', clientOpId: opId(), mode: 'RECEIVE', warehouseId: whB1, quantity: 1, product: { name: 'Producto que no debe quedar', unit: 'UN' } },
      ]);
      expect(result?.status).toBe('REJECTED');
      expect(await prisma.product.count({ where: { companyId: companyA, name: 'Producto que no debe quedar' } })).toBe(0);
    });
  });

  describe('envío con operaciones mezcladas', () => {
    it('una operación inválida no tumba a las demás', async () => {
      const good = opId();
      const results = await processOperations(actor(companyA), [
        { kind: 'MOVE', clientOpId: 'mala-op-1', mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: -3 },
        { kind: 'MOVE', clientOpId: good, mode: 'RECEIVE', productId: productA, warehouseId: whA1, quantity: 2 },
        'basura',
      ]);
      expect(results[0]).toMatchObject({ clientOpId: 'mala-op-1', status: 'REJECTED', code: 'INVALID' });
      expect(results[1]).toMatchObject({ clientOpId: good, status: 'APPLIED' });
      expect(results[2]).toMatchObject({ status: 'REJECTED', code: 'INVALID' });
    });
  });

  describe('identificación por foto: cuota y caché', () => {
    const photo = async (seed: number) =>
      sharp({ create: { width: 64, height: 64, channels: 3, background: { r: seed % 256, g: (seed * 7) % 256, b: (seed * 13) % 256 } } })
        .jpeg()
        .toBuffer();

    const read = {
      isProduct: true,
      name: 'Aceite de maravilla',
      brand: 'Chef',
      netContent: '900 ml',
      confidence: 'high',
      warnings: [],
    };

    beforeEach(async () => {
      visionRead.mockReset();
      await prisma.productPhotoScan.deleteMany({ where: { companyId: { in: [companyA, companyB, companyC] } } });
    });

    it('reconoce el producto del catálogo y guarda la lectura', async () => {
      visionRead.mockResolvedValue({ raw: read, model: 'modelo-de-prueba' });
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(1), undefined);
      expect(result.status).toBe('matched');
      expect(result.candidates[0]).toMatchObject({ id: productC, reason: 'text' });
      expect(visionRead).toHaveBeenCalledTimes(1);
      expect(await prisma.productPhotoScan.count({ where: { companyId: companyC, status: 'DONE' } })).toBe(1);
    });

    it('la misma foto reenviada se responde de caché sin gastar otra lectura', async () => {
      visionRead.mockResolvedValue({ raw: read, model: 'modelo-de-prueba' });
      const bytes = await photo(2);
      await identifyPhoto({ companyId: companyC, userId: 'u1' }, bytes, undefined);
      const again = await identifyPhoto({ companyId: companyC, userId: 'u2' }, bytes, undefined);
      expect(again).toMatchObject({ status: 'matched', cached: true });
      expect(visionRead).toHaveBeenCalledTimes(1);
    });

    it('el caché es por empresa: la foto de otra empresa no se lee gratis', async () => {
      visionRead.mockResolvedValue({ raw: read, model: 'modelo-de-prueba' });
      const bytes = await photo(3);
      await identifyPhoto({ companyId: companyC, userId: 'u1' }, bytes, undefined);
      const other = await identifyPhoto({ companyId: companyB, userId: 'u9' }, bytes);
      expect(other.cached).toBe(false);
      expect(visionRead).toHaveBeenCalledTimes(2);
    });

    it('una persona que fotografía en ráfaga recibe "en espera" en vez de saturar la IA', async () => {
      visionRead.mockResolvedValue({ raw: read, model: 'modelo-de-prueba' });
      const statuses: string[] = [];
      for (let i = 10; i < 16; i++) {
        const result = await identifyPhoto({ companyId: companyC, userId: 'ráfaga' }, await photo(i), undefined);
        statuses.push(result.status);
        if (result.status === 'busy') expect(result.retryAfterMs).toBeGreaterThanOrEqual(2000);
      }
      // Tope por persona: 3 por minuto; el resto espera.
      expect(statuses.filter((status) => status === 'matched')).toHaveLength(3);
      expect(statuses.filter((status) => status === 'busy')).toHaveLength(3);
      expect(visionRead).toHaveBeenCalledTimes(3);
    });

    it('cuando Gemini responde 429, se frena a todas las empresas durante el enfriamiento', async () => {
      const { VisionRateLimitedError } = await import('@/modules/warehouse-mobile/services/vision.service');
      visionRead.mockRejectedValueOnce(new VisionRateLimitedError());
      const first = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(30), undefined);
      expect(first.status).toBe('busy');

      visionRead.mockResolvedValue({ raw: read, model: 'modelo-de-prueba' });
      const other = await identifyPhoto({ companyId: companyB, userId: 'u2' }, await photo(31));
      expect(other.status).toBe('busy');
      expect(visionRead).toHaveBeenCalledTimes(1);
    });

    it('una falla del proveedor se informa como error (no como saturación) y deja constancia', async () => {
      visionRead.mockRejectedValueOnce(new Error('respuesta inesperada'));
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(70), undefined);
      expect(result).toMatchObject({ status: 'error' });
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(15_000);
      expect(await prisma.productPhotoScan.count({ where: { companyId: companyC, status: 'FAILED' } })).toBe(1);
    });

    it('un producto que no está en el catálogo se ofrece como nuevo con lo leído', async () => {
      visionRead.mockResolvedValue({ raw: { isProduct: true, name: 'Cuaderno universitario', brand: 'Torre', confidence: 'medium', warnings: [] }, model: 'modelo-de-prueba' });
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(40), undefined);
      expect(result.status).toBe('new');
      expect(result.read).toMatchObject({ name: 'Cuaderno universitario', brand: 'Torre' });
    });

    it('una foto sin producto legible se informa y no ofrece nada', async () => {
      visionRead.mockResolvedValue({ raw: { isProduct: false, confidence: 'low', warnings: [] }, model: 'modelo-de-prueba' });
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(50), undefined);
      expect(result).toMatchObject({ status: 'unreadable', candidates: [] });
    });

    it('el SKU impreso en la etiqueta lleva al producto, sin importar mayúsculas ni guiones, pero siempre a confirmar', async () => {
      visionRead.mockResolvedValue({ raw: { isProduct: true, sku: 'Cód.: ace 900', name: 'Otro nombre', confidence: 'high' }, model: 'modelo-de-prueba' });
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(81), undefined);
      expect(result.status).toBe('matched');
      expect(result.candidates[0]).toMatchObject({ id: productC, reason: 'sku' });
      // No es un código de barras (sin dígito verificador): no tiene la certeza de uno.
      expect(result.candidates[0]!.score).toBeLessThan(1);
    });

    it('el SKU solo busca en el catálogo de la propia empresa', async () => {
      const other = await prisma.company.create({ data: { rut: `76${suffix}9-9`, businessName: `Bodega Test D ${suffix}` } });
      try {
        visionRead.mockResolvedValue({ raw: { isProduct: true, sku: 'ACE-900', confidence: 'high' }, model: 'modelo-de-prueba' });
        const result = await identifyPhoto({ companyId: other.id, userId: 'u1' }, await photo(82), undefined);
        expect(result.status).toBe('new');
        expect(result.candidates).toEqual([]);
      } finally {
        await prisma.productPhotoScan.deleteMany({ where: { companyId: other.id } });
        await prisma.company.delete({ where: { id: other.id } });
      }
    });

    it('si dos productos comparten el SKU una vez normalizado, la persona elige', async () => {
      const a = await prisma.product.create({ data: { companyId: companyC, sku: 'DUP-100', name: 'Duplicado A', netPrice: 1, grossPrice: 1 } });
      const b = await prisma.product.create({ data: { companyId: companyC, sku: 'dup100', name: 'Duplicado B', netPrice: 1, grossPrice: 1 } });
      visionRead.mockResolvedValue({ raw: { isProduct: true, sku: 'DUP 100', confidence: 'high' }, model: 'modelo-de-prueba' });
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(83), undefined);
      expect(result.status).toBe('candidates');
      expect(result.candidates.map((candidate) => candidate.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('un SKU que no existe se ofrece como SKU del producto nuevo', async () => {
      visionRead.mockResolvedValue({ raw: { isProduct: true, sku: 'ZZ-777', name: 'Producto sin registrar', brand: 'Marca', confidence: 'high' }, model: 'modelo-de-prueba' });
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(84), undefined);
      expect(result.status).toBe('new');
      expect(result.read).toMatchObject({ sku: 'ZZ-777' });
    });

    it('un código de barras leído en la etiqueta lleva directo al producto', async () => {
      visionRead.mockResolvedValue({ raw: { isProduct: true, name: 'Aceite', barcode: '4006381333931', confidence: 'high', warnings: [] }, model: 'modelo-de-prueba' });
      const result = await identifyPhoto({ companyId: companyC, userId: 'u1' }, await photo(60), undefined);
      expect(result.status).toBe('matched');
      expect(result.candidates[0]).toMatchObject({ id: productC, reason: 'barcode', score: 1 });
    });
  });
});

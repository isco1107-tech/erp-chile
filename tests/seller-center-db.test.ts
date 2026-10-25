/**
 * Seller Center contra una base PostgreSQL REAL: invitar, aceptar, ingresar con bloqueo, sesión
 * revalidada en cada página (acceso, empresa, módulo, versión), aislamiento entre empresas y lo
 * que ve el seller (sus ventas con la regla de la liquidación, lo pendiente, sus mermas desde que
 * recibió la mercadería, nada de costos ni de otros sellers).
 *
 *   RETAIL_TEST_DATABASE_URL=postgresql://postgres@localhost:54329/erp_test \
 *     npx jest tests/seller-center-db.test.ts
 *
 * Se niega a correr si el servidor no es local o si la base no termina en `_test` (la base del
 * `.env` del proyecto ES la de producción, CLAUDE.md §5).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { sendEmail } from '@/lib/email/mailer';
jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://aether.test', sendEmail: jest.fn(async () => ({ status: 'sent', provider: 'none' })) }));

// `jose` es ESM y no carga en Jest: aquí se prueba lo que hace la base con el contenido del token.
jest.mock('@/lib/supplier-portal/session', () => ({
  createSupplierSessionToken: async (input: object) => JSON.stringify({ purpose: 'supplier_session', ...input }),
  verifySupplierSessionToken: async (token: string) => {
    try {
      return JSON.parse(token);
    } catch {
      return null;
    }
  },
}));

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

describeDb('Seller Center contra PostgreSQL', () => {
  let prisma: PrismaClient;
  let auth: typeof import('@/modules/inventory/services/seller-center-auth.service');
  let admin: typeof import('@/modules/inventory/services/seller-center.service');
  let views: typeof import('@/modules/inventory/services/seller-center-view.service');
  let hash: (token: string) => string;

  const suffix = Math.random().toString(36).slice(2, 8);
  const ids: Record<string, string> = {};
  const actor = { id: 'u-admin', name: 'Ana Administradora' };
  const email = `productora-${suffix}@campo.cl`;
  const phone = `+569${String(Date.now()).slice(-8)}`;
  const automaticEmail = `automatic-${suffix}@campo.cl`;
  const lockEmail = `bloqueo-${suffix}@campo.cl`;
  const PASSWORD = 'Miel-del-Sur-2026';
  const TOKEN_A = 'A'.repeat(43);
  const TOKEN_B = 'B'.repeat(43);
  const now = new Date();
  const month = now.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 7);
  let folio = 1;

  const session = (input: { personId: string; membershipId: string; sessionVersion: number }) => JSON.stringify({ purpose: 'supplier_session', ...input });
  const setToken = (membershipId: string, token: string) => prisma.supplierPortalMembership.update({ where: { id: membershipId }, data: { inviteTokenHash: hash(token) } });

  async function sale(companyId: string, productId: string, quantity: number, subtotal: number, consignorId: string, dteType: 'BOLETA_39' | 'NOTA_CREDITO_61' = 'BOLETA_39', status: 'ISSUED' | 'CANCELLED' = 'ISSUED') {
    const warehouseId = companyId === ids.a ? ids.wa! : ids.wb!;
    const contactId = companyId === ids.a ? ids.customerA! : ids.customerB!;
    await prisma.salesDocument.create({
      data: {
        companyId,
        contactId,
        warehouseId,
        dteType,
        folio: folio++,
        status,
        issueDate: now,
        paymentMethod: 'EFECTIVO',
        netAmount: subtotal,
        totalAmount: subtotal,
        items: { create: [{ companyId, productId, sku: 'SKU-LINEA', description: 'Miel de ulmo', quantity, unitPrice: Math.round(subtotal / quantity), subtotal, iva: 0, total: subtotal, unitCostPMP: 777, consignorId, consignorCommissionBps: 2000 }] },
      },
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    ({ prisma } = await import('@/lib/prisma'));
    auth = await import('@/modules/inventory/services/seller-center-auth.service');
    admin = await import('@/modules/inventory/services/seller-center.service');
    views = await import('@/modules/inventory/services/seller-center-view.service');
    ({ hashAccountToken: hash } = await import('@/lib/supplier-portal/accounts'));

    const company = async (key: string, n: number) => {
      ids[key] = (await prisma.company.create({ data: { rut: `82${suffix}${n}-${n}`, businessName: `Super ${key.toUpperCase()} ${suffix}`, features: { create: { hasInventory: true, hasSellerCenter: true, hasShrinkageLiability: true } } } })).id;
    };
    await company('a', 1);
    await company('b', 2);
    ids.wa = (await prisma.warehouse.create({ data: { companyId: ids.a!, name: 'Sala', code: 'SALA', isDefault: true } })).id;
    ids.wb = (await prisma.warehouse.create({ data: { companyId: ids.b!, name: 'Sala', code: 'SALA', isDefault: true } })).id;
    const contact = (companyId: string, name: string, n: number, kind: 'seller' | 'supplier' | 'customer') =>
      prisma.contact
        .create({
          data: {
            companyId,
            razonSocial: name,
            rut: `75.${n}00.000-${n}`,
            rutClean: `75${n}00000${n}`,
            isConsignor: kind === 'seller',
            consignmentCommissionBps: kind === 'seller' ? 2000 : null,
            isSupplier: kind === 'supplier',
            isCustomer: kind === 'customer',
          },
        })
        .then((c) => c.id);
    ids.miel = await contact(ids.a!, 'Miel del Sur', 1, 'seller');
    ids.quesos = await contact(ids.a!, 'Lácteos Llanquihue', 2, 'seller');
    ids.onlySupplier = await contact(ids.a!, 'Distribuidora Solo Proveedor', 6, 'supplier');
    ids.customerA = await contact(ids.a!, 'Consumidor final', 3, 'customer');
    ids.supplierB = await contact(ids.b!, 'Miel del Sur (en B)', 4, 'seller');
    ids.customerB = await contact(ids.b!, 'Consumidor final', 5, 'customer');

    // Mercadería en consignación: cada producto tiene un solo dueño.
    const product = (companyId: string, sku: string, consignorId: string) =>
      prisma.product.create({ data: { companyId, sku: `${sku}-${suffix}`, name: sku, netPrice: 3000, grossPrice: 3570, costPricePMP: 1500, consignorId } }).then((p) => p.id);
    ids.pMiel = await product(ids.a!, 'Miel', ids.miel!);
    ids.pQueso = await product(ids.a!, 'Queso', ids.quesos!);
    ids.pMielB = await product(ids.b!, 'MielB', ids.supplierB!);
  });

  afterAll(async () => {
    if (!prisma) return;
    for (const companyId of [ids.a, ids.b].filter(Boolean) as string[]) {
      await prisma.supplierPortalMembership.deleteMany({ where: { companyId } });
      await prisma.shrinkageLiability.deleteMany({ where: { companyId } });
      await prisma.inventoryMovement.deleteMany({ where: { companyId } });
      await prisma.salesDocumentItem.deleteMany({ where: { companyId } });
      await prisma.salesDocument.deleteMany({ where: { companyId } });
      await prisma.sellerSettlementLine.deleteMany({ where: { companyId } });
      await prisma.sellerSettlement.deleteMany({ where: { companyId } });
      await prisma.productSupplier.deleteMany({ where: { companyId } });
      await prisma.product.deleteMany({ where: { companyId } });
      await prisma.contact.deleteMany({ where: { companyId } });
      await prisma.warehouse.deleteMany({ where: { companyId } });
      await prisma.companyFeatures.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.supplierPortalPerson.deleteMany({ where: { OR: [{ email: { in: [email, lockEmail, automaticEmail] } }, { phone }] } });
    await prisma.$disconnect();
  });

  it('invitar crea la persona y un acceso pendiente; aceptar exige una contraseña segura y el enlace sirve una vez', async () => {
    const { membershipId } = await admin.inviteSupplierPerson(ids.a!, ids.miel!, actor, { name: 'Rosa Productora', email: `  ${email.toUpperCase()} ` });
    ids.mA = membershipId;
    expect(await admin.listSupplierAccounts(ids.a!, ids.miel!)).toMatchObject([{ id: membershipId, name: 'Rosa Productora', email, status: 'PENDING', invitedByName: 'Ana Administradora' }]);
    await setToken(membershipId, TOKEN_A);

    expect(await auth.inspectInvitation(TOKEN_A)).toMatchObject({ state: 'valid', email, hasPassword: false, supplierName: 'Miel del Sur' });
    // Un contacto que solo es proveedor no tiene Seller Center: es el portal de los sellers.
    await expect(admin.inviteSupplierPerson(ids.a!, ids.onlySupplier!, actor, { name: 'X', email: `x-${suffix}@campo.cl` })).rejects.toThrow('no está marcado como seller');
    await expect(auth.acceptInvitation(TOKEN_A, 'corta')).rejects.toThrow('al menos 8');
    const accepted = await auth.acceptInvitation(TOKEN_A, PASSWORD);
    expect(accepted).toMatchObject({ membershipId, sessionVersion: 0 });
    ids.person = accepted.personId;
    await expect(auth.acceptInvitation(TOKEN_A, PASSWORD)).rejects.toThrow('no es válido');
    expect(await auth.inspectInvitation(TOKEN_A)).toEqual({ state: 'invalid' });
    expect((await admin.listSupplierAccounts(ids.a!, ids.miel!))[0]!.status).toBe('ACTIVE');
  });

  it('ingresa con su contraseña; con una equivocada no, y sin decir si el correo existe', async () => {
    expect(await auth.loginSupplierPerson(email.toUpperCase(), PASSWORD)).toEqual({ personId: ids.person, membershipId: ids.mA, sessionVersion: 0 });
    expect(await auth.loginSupplierPerson(email, 'Otra-Clave-123')).toBeNull();
    expect(await auth.loginSupplierPerson(`nadie-${suffix}@campo.cl`, PASSWORD)).toBeNull();
  });

  it('cinco intentos fallidos bloquean la cuenta 15 minutos, aun con la contraseña correcta', async () => {
    const person = await prisma.supplierPortalPerson.create({ data: { email: lockEmail, name: 'Bloqueo', passwordHash: await (await import('bcryptjs')).default.hash(PASSWORD, 4) } });
    await prisma.supplierPortalMembership.create({ data: { companyId: ids.a!, supplierId: ids.quesos!, personId: person.id, personName: 'Bloqueo', acceptedAt: now } });
    for (let i = 0; i < 5; i++) expect(await auth.loginSupplierPerson(lockEmail, 'Mala-Clave-1')).toBeNull();
    await expect(auth.loginSupplierPerson(lockEmail, PASSWORD)).rejects.toThrow('Demasiados intentos');
  });

  it('la sesión se revalida: acceso desactivado, módulo apagado, empresa suspendida o contraseña cambiada la cortan', async () => {
    const token = session({ personId: ids.person!, membershipId: ids.mA!, sessionVersion: 0 });
    expect(await auth.resolveSupplierSession(token)).toMatchObject({ companyId: ids.a, supplierId: ids.miel, supplier: { name: 'Miel del Sur' }, showsLiability: true, others: [] });
    // Un token con el acceso de otra persona no sirve.
    expect(await auth.resolveSupplierSession(session({ personId: 'otra', membershipId: ids.mA!, sessionVersion: 0 }))).toBeNull();

    await admin.setSupplierAccountActive(ids.a!, ids.mA!, false);
    expect(await auth.resolveSupplierSession(token)).toBeNull();
    expect(await auth.loginSupplierPerson(email, PASSWORD).catch((error: Error) => error.message)).toMatch('no tiene un acceso activo');
    await admin.setSupplierAccountActive(ids.a!, ids.mA!, true);

    await prisma.companyFeatures.update({ where: { companyId: ids.a! }, data: { hasSellerCenter: false } });
    expect(await auth.resolveSupplierSession(token)).toBeNull();
    await prisma.companyFeatures.update({ where: { companyId: ids.a! }, data: { hasSellerCenter: true, hasInventory: false } });
    expect(await auth.resolveSupplierSession(token)).toBeNull();
    await prisma.companyFeatures.update({ where: { companyId: ids.a! }, data: { hasInventory: true } });

    await prisma.company.update({ where: { id: ids.a! }, data: { status: 'SUSPENDED' } });
    expect(await auth.resolveSupplierSession(token)).toBeNull();
    await prisma.company.update({ where: { id: ids.a! }, data: { status: 'ACTIVE' } });
    expect(await auth.resolveSupplierSession(token)).not.toBeNull();

    // Recuperar la contraseña cierra las sesiones abiertas.
    await prisma.supplierPortalPerson.update({ where: { id: ids.person! }, data: { resetTokenHash: hash(TOKEN_B), resetExpiresAt: new Date(now.getTime() + 60_000) } });
    await expect(auth.resetPassword(TOKEN_B, 'debil')).rejects.toThrow();
    await auth.resetPassword(TOKEN_B, `${PASSWORD}x`);
    await expect(auth.resetPassword(TOKEN_B, `${PASSWORD}y`)).rejects.toThrow('no es válido');
    expect(await auth.resolveSupplierSession(token)).toBeNull();
    expect(await auth.loginSupplierPerson(email, `${PASSWORD}x`)).toMatchObject({ sessionVersion: 1 });
  });

  it('otra empresa invita a la misma persona: entra con SU contraseña y ve las dos empresas', async () => {
    const { membershipId } = await admin.inviteSupplierPerson(ids.b!, ids.supplierB!, { id: 'u-b', name: 'Beto' }, { name: 'Otro Nombre', email });
    ids.mB = membershipId;
    await setToken(membershipId, TOKEN_B);
    expect(await auth.inspectInvitation(TOKEN_B)).toMatchObject({ state: 'valid', hasPassword: true, personName: 'Rosa Productora' });
    // Cada empresa ve el nombre con que ella invitó, nunca el que escribió la otra.
    expect((await admin.listSupplierAccounts(ids.b!, ids.supplierB!))[0]).toMatchObject({ name: 'Otro Nombre', email });
    expect((await admin.listSupplierAccounts(ids.a!, ids.miel!))[0]).toMatchObject({ name: 'Rosa Productora' });
    // Nadie suma un acceso a la cuenta de otro sin su contraseña (ni crea una nueva encima).
    await expect(auth.acceptInvitation(TOKEN_B, 'Inventada-2026')).rejects.toThrow('no es correcta');
    expect(await auth.acceptInvitation(TOKEN_B, `${PASSWORD}x`)).toMatchObject({ membershipId, personId: ids.person });
    const account = await auth.resolveSupplierSession(session({ personId: ids.person!, membershipId: ids.mA!, sessionVersion: 1 }));
    expect(account?.others.map((other) => other.membershipId)).toEqual([ids.mB]);
    expect(await auth.switchSupplierMembership(ids.person!, ids.mB!)).toMatchObject({ membershipId: ids.mB });
  });

  it('cada empresa administra solo sus accesos y sus proveedores', async () => {
    await expect(admin.setSupplierAccountActive(ids.b!, ids.mA!, false)).rejects.toThrow('no existe en tu empresa');
    await expect(admin.cancelSupplierInvite(ids.b!, ids.mA!)).rejects.toThrow();
    await expect(admin.resendSupplierInvite(ids.b!, ids.mA!, actor)).rejects.toThrow();
    await expect(admin.inviteSupplierPerson(ids.a!, ids.supplierB!, actor, { name: 'X', email: `x-${suffix}@campo.cl` })).rejects.toThrow('no está marcado como seller');
    await expect(admin.inviteSupplierPerson(ids.a!, ids.customerA!, actor, { name: 'X', email: `x-${suffix}@campo.cl` })).rejects.toThrow('no está marcado como seller');
    await expect(admin.inviteSupplierPerson(ids.a!, ids.quesos!, actor, { name: 'Rosa', email })).rejects.toThrow('otro seller de tu empresa');
    await expect(auth.switchSupplierMembership(ids.person!, 'acceso-ajeno')).rejects.toThrow('no está disponible');
    await prisma.supplierPortalPerson.deleteMany({ where: { email: `x-${suffix}@campo.cl` } });
  });

  it('ve sus ventas con la comisión y lo que le corresponde, lo pendiente, sus mermas desde que recibió, y jamás costos', async () => {
    await sale(ids.a!, ids.pMiel!, 3, 9000, ids.miel!);
    await sale(ids.a!, ids.pMiel!, 1, 3000, ids.miel!, 'NOTA_CREDITO_61');
    await sale(ids.a!, ids.pMiel!, 5, 15000, ids.miel!, 'BOLETA_39', 'CANCELLED');
    await sale(ids.a!, ids.pQueso!, 4, 12000, ids.quesos!);
    await sale(ids.b!, ids.pMielB!, 7, 21000, ids.supplierB!);

    const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
    const movement = (productId: string, data: Pick<Prisma.InventoryMovementUncheckedCreateInput, 'type' | 'quantity'> & Partial<Prisma.InventoryMovementUncheckedCreateInput>, createdAt: Date) =>
      prisma.inventoryMovement.create({ data: { companyId: ids.a!, productId, warehouseId: ids.wa!, unitCost: 0, totalCost: 0, previousStock: 50, newStock: 48, previousPmp: 0, newPmp: 0, createdAt, ...data } });
    const loss = (productId: string, quantity: number, reasonCode: string, createdAt: Date) =>
      movement(productId, { type: 'ADJUSTMENT_OUT', quantity, unitCost: 1500, totalCost: 1500 * quantity, reasonCode, notes: 'Nota interna de la tienda', evidenceUrl: 'https://evil.example.com/x.jpg' }, createdAt);
    // Antes de recibirla, la mercadería era de otro dueño: esa merma no es suya.
    await loss(ids.pMiel!, 9, 'DAMAGED', at(30));
    await movement(ids.pMiel!, { type: 'PURCHASE_IN', quantity: 20, supplierId: ids.miel!, reference: 'Recepción en consignación' }, at(20));
    const own = await loss(ids.pMiel!, 2, 'EXPIRED', at(10));
    const assigned = await loss(ids.pQueso!, 1, 'DAMAGED', at(5));
    await loss(ids.pQueso!, 4, 'DAMAGED', at(4));
    await prisma.shrinkageLiability.create({ data: { companyId: ids.a!, movementId: own.id, party: 'SUPPLIER', supplierId: ids.miel! } });
    await prisma.shrinkageLiability.create({ data: { companyId: ids.a!, movementId: assigned.id, party: 'SUPPLIER', supplierId: ids.miel! } });

    const account = await auth.resolveSupplierSession(session({ personId: ids.person!, membershipId: ids.mA!, sessionVersion: 1 }));
    const view = await views.getSellerCenterView(account!, month);
    // 3 vendidas a $9.000 menos 1 devuelta a $3.000; la anulada no cuenta; comisión 20 %.
    expect(view.sales).toMatchObject({ units: 2, net: 6000, commission: 1200, payout: 4800 });
    expect(view.sales.rows).toEqual([{ key: ids.pMiel, sku: 'SKU-LINEA', name: 'Miel de ulmo', units: 2, net: 6000, commission: 1200, payout: 4800 }]);
    // Su mercadería y lo pendiente vienen de la misma vista del portal (lo vendido aún no liquidado).
    expect(view.portal.consignment?.rows.map((row) => row.name)).toEqual(['Miel']);
    expect(view.portal.consignment?.pending).toMatchObject({ units: 2, netSales: 6000, commissionAmount: 1200, payoutAmount: 4800 });
    expect(view.losses.rows.map((row) => [row.name, row.quantity, row.responsible])).toEqual([
      ['Queso', 1, 'YOU'],
      ['Miel', 2, 'YOU'],
    ]);
    expect(view.losses).toMatchObject({ units: 3, yoursUnits: 3 });
    // Ni costos, ni notas internas, ni fotos fuera de nuestro almacenamiento, ni otro seller ni clientes.
    const json = JSON.stringify(view);
    for (const forbidden of ['1500', '777', 'costPrice', 'totalCost', 'Nota interna', 'evil.example', 'Lácteos', 'Consumidor']) expect(json).not.toContain(forbidden);

    // La otra empresa ve solo lo suyo.
    const inB = await auth.resolveSupplierSession(session({ personId: ids.person!, membershipId: ids.mB!, sessionVersion: 1 }));
    const viewB = await views.getSellerCenterView(inB!, month);
    expect(viewB.sales).toMatchObject({ units: 7, net: 21000, payout: 16800 });
    expect(viewB.losses.rows).toEqual([]);
  });
  it('el celular recibe una invitación WhatsApp de un solo uso, conserva su identidad y exige la contraseña al sumar otra empresa', async () => {
    const invited = await admin.inviteSupplierPerson(ids.a!, ids.quesos!, actor, { name: 'Rosa celular', phone });
    expect(invited.delivery).toBe('whatsapp');
    const message = new URL(invited.whatsappUrl!).searchParams.get('text')!;
    const originalToken = /invitacion\/([\w-]{43})/.exec(message)![1]!;
    expect(message).toContain(phone);
    const pending = await prisma.supplierPortalMembership.findFirstOrThrow({ where: { companyId: ids.a!, id: invited.membershipId }, include: { person: true } });
    expect(pending.person).toMatchObject({ email: null, phone, passwordHash: null });
    expect(pending.inviteTokenHash).toBe(hash(originalToken));
    const resent = await admin.resendSupplierInvite(ids.a!, invited.membershipId, actor);
    expect(await auth.inspectInvitation(originalToken)).toEqual({ state: 'invalid' });
    const token = /invitacion\/([\w-]{43})/.exec(new URL(resent.whatsappUrl!).searchParams.get('text')!)![1]!;
    expect(await auth.inspectInvitation(token)).toMatchObject({ state: 'valid', email: null, phone, hasPassword: false });
    const accepted = await auth.acceptInvitation(token, PASSWORD);
    expect(await auth.loginSupplierPerson(phone.slice(3), PASSWORD)).toMatchObject({ personId: accepted.personId });
    expect(await auth.loginSupplierPerson(phone, 'Otra-Clave-2026')).toBeNull();
    await expect(auth.acceptInvitation(token, PASSWORD)).rejects.toThrow();
    const second = await admin.inviteSupplierPerson(ids.b!, ids.supplierB!, actor, { name: 'Rosa en B', phone });
    const secondToken = /invitacion\/([\w-]{43})/.exec(new URL(second.whatsappUrl!).searchParams.get('text')!)![1]!;
    await expect(auth.acceptInvitation(secondToken, 'Otra-Clave-2026')).rejects.toThrow('no es correcta');
    expect(await auth.acceptInvitation(secondToken, PASSWORD)).toMatchObject({ personId: accepted.personId });
    await admin.setSupplierAccountActive(ids.a!, invited.membershipId, false);
    expect(await auth.resolveSupplierSession(session(accepted))).toBeNull();
    expect(await auth.loginSupplierPerson(phone, PASSWORD)).toMatchObject({ membershipId: second.membershipId });
  });

  it('crear el seller y su acceso es atómico; un correo fallido conserva ambos para reenviarlo', async () => {
    const { createSellerWithInvitation } = await import('@/modules/contacts/services/seller-onboarding.service');
    const input = { rut: '12.345.678-5', razonSocial: `Nuevo seller ${suffix}`, isConsignor: true, consignmentCommissionBps: 2000 };
    jest.mocked(sendEmail).mockClear();
    await expect(createSellerWithInvitation(ids.a!, actor, input, { name: 'Rosa', email })).rejects.toThrow('otro seller');
    expect(await prisma.contact.count({ where: { companyId: ids.a!, rutClean: '123456785' } })).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    jest.mocked(sendEmail).mockResolvedValueOnce({ status: 'failed', provider: 'none' });
    const created = await createSellerWithInvitation(ids.a!, actor, input, { name: 'Nueva persona', email: automaticEmail });
    expect(created.onboarding.delivery).toBe('failed');
    expect(await prisma.contact.count({ where: { companyId: ids.a!, id: created.contact.id } })).toBe(1);
    expect(await prisma.supplierPortalMembership.count({ where: { companyId: ids.a!, id: created.onboarding.membershipId, supplierId: created.contact.id, acceptedAt: null } })).toBe(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: automaticEmail, text: expect.stringContaining('Instalar Seller Center') }));
    expect(jest.mocked(sendEmail).mock.calls[0]![0]).not.toHaveProperty('companyId');
    expect((await admin.resendSupplierInvite(ids.a!, created.onboarding.membershipId, actor)).delivery).toBe('sent');
    expect(await prisma.contact.count({ where: { companyId: ids.a!, id: created.contact.id } })).toBe(1);
  });

});

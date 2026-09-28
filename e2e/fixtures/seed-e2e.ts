/**
 * Datos extra para los recorridos E2E, sobre lo que deja prisma/seed.ts:
 * - Multiempresa: una segunda empresa con el módulo activo y una persona que
 *   trabaja en las dos (hogar + membresía).
 * - POS contratado en la empresa de prueba, para recorrer el POS real y su
 *   modo sin conexión: una cajera con su turno ya abierto y un producto sin
 *   control de stock (la venta no depende de existencias), más uno con
 *   control de stock para la pantalla de contingencia de bodega.
 *
 * SOLO para la base efímera de E2E: la DATABASE_URL local de este proyecto es
 * la de producción (CLAUDE.md §5), así que exige E2E_DATABASE=1 y se niega a
 * correr contra Neon o en un runtime de producción.
 *
 *   E2E_DATABASE=1 npx tsx e2e/fixtures/seed-e2e.ts
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma';
import { formatRut } from '../../src/lib/chile/rut';
import { assertScriptCanRun } from '../../scripts/lib/guard-production';

export const MULTI_USER_EMAIL = 'multi@prueba.local';
export const HOME_COMPANY_NAME = 'Empresa de Prueba';
export const SECOND_COMPANY_NAME = 'Filial E2E SpA';
export const CASHIER_EMAIL = 'cajero@prueba.local';
export const POS_PRODUCT_SKU = 'E2E-CAFE';
export const STOCK_PRODUCT_SKU = 'E2E-HARINA';

async function main() {
  assertScriptCanRun('e2e/fixtures/seed-e2e.ts');
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.E2E_DATABASE !== '1' || /neon\.tech/i.test(url)) {
    process.stderr.write('seed-e2e: solo corre contra la base efímera de E2E (E2E_DATABASE=1, nunca Neon).\n');
    process.exit(1);
  }
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error('Falta SEED_ADMIN_PASSWORD');

  const home = await prisma.company.findUniqueOrThrow({ where: { rut: formatRut('99999999-9') } });
  await prisma.companyFeatures.upsert({
    where: { companyId: home.id },
    update: { hasPos: true },
    create: { companyId: home.id, hasPos: true },
  });
  const second = await prisma.company.upsert({
    where: { rut: formatRut('76192083-9') },
    update: {},
    create: {
      rut: formatRut('76192083-9'),
      businessName: SECOND_COMPANY_NAME,
      address: 'Av. Siempre Viva 742',
      phone: '+56911111111',
      email: 'filial@prueba.local',
      features: { create: { hasMultiCompany: true } },
    },
  });
  await prisma.companyFeatures.upsert({
    where: { companyId: second.id },
    update: { hasMultiCompany: true },
    create: { companyId: second.id, hasMultiCompany: true },
  });

  const user = await prisma.user.upsert({
    where: { email: MULTI_USER_EMAIL },
    update: {},
    create: { email: MULTI_USER_EMAIL, passwordHash: await bcrypt.hash(password, 12), name: 'Persona Multiempresa', role: 'SALES', companyId: home.id },
  });
  await prisma.companyMembership.upsert({
    where: { userId_companyId: { userId: user.id, companyId: second.id } },
    update: { role: 'ACCOUNTANT' },
    create: { userId: user.id, companyId: second.id, role: 'ACCOUNTANT' },
  });
  // POS: caja en la bodega del seed, turno abierto de la cajera y un producto.
  const cashier = await prisma.user.upsert({
    where: { email: CASHIER_EMAIL },
    update: {},
    create: { email: CASHIER_EMAIL, passwordHash: await bcrypt.hash(password, 12), name: 'Cajera E2E', role: 'SALES', companyId: home.id },
  });
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { companyId_code: { companyId: home.id, code: 'CENTRAL' } } });
  const register = await prisma.cashRegister.upsert({
    where: { companyId_name: { companyId: home.id, name: 'Caja E2E' } },
    update: {},
    create: { companyId: home.id, warehouseId: warehouse.id, name: 'Caja E2E' },
  });
  const openShift = await prisma.cashShift.findFirst({ where: { companyId: home.id, userId: cashier.id, status: 'OPEN' } });
  if (!openShift) {
    await prisma.cashShift.create({ data: { companyId: home.id, cashRegisterId: register.id, userId: cashier.id, initialAmount: 0 } });
  }
  await prisma.product.upsert({
    where: { companyId_sku: { companyId: home.id, sku: POS_PRODUCT_SKU } },
    update: {},
    create: { companyId: home.id, sku: POS_PRODUCT_SKU, name: 'Café E2E', isTrackable: false, netPrice: 2000, grossPrice: 2380 },
  });
  // Con control de stock: para los movimientos de bodega del modo sin conexión.
  await prisma.product.upsert({
    where: { companyId_sku: { companyId: home.id, sku: STOCK_PRODUCT_SKU } },
    update: {},
    create: { companyId: home.id, sku: STOCK_PRODUCT_SKU, name: 'Harina E2E', isTrackable: true, netPrice: 1500, grossPrice: 1785 },
  });

  console.log('Datos E2E listos');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

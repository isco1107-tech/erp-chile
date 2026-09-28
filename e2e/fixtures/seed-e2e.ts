/**
 * Datos extra para los recorridos E2E, sobre lo que deja prisma/seed.ts:
 * - Multiempresa: una segunda empresa con el módulo activo y una persona que
 *   trabaja en las dos (hogar + membresía).
 * - POS contratado en la empresa de prueba, para recorrer el POS real y su
 *   modo sin conexión.
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
  console.log('Datos E2E listos');
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { formatRut } from '../src/lib/chile/rut';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

// El RUT se persiste siempre en formato canónico (12.345.678-K). Sembrarlo sin
// formato creaba una segunda empresa en cada corrida, porque el `where` del
// upsert no coincidía con el registro ya existente.
const COMPANY_RUT = formatRut('99999999-9');

async function main() {
  const company = await prisma.company.upsert({
    where: { rut: COMPANY_RUT },
    update: {},
    create: {
      rut: COMPANY_RUT,
      businessName: 'Empresa de Prueba',
      address: 'Calle Falsa 123',
      phone: '+56912345678',
      email: 'admin@prueba.local',
    },
  });

  // Nunca sembrar una credencial fija: este seed corre contra entornos
  // desplegados y públicamente alcanzables. Sin SEED_ADMIN_PASSWORD se genera
  // una aleatoria y se imprime una sola vez.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(15).toString('base64url');
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Password generada para admin@prueba.local: ${adminPassword}`);
  }

  await prisma.user.upsert({
    where: { email: 'admin@prueba.local' },
    update: { role: 'OWNER' },
    create: {
      email: 'admin@prueba.local',
      passwordHash,
      name: 'Admin Prueba',
      role: 'OWNER',
      companyId: company.id,
    },
  });

  await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: 'CENTRAL' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'Bodega Principal',
      code: 'CENTRAL',
      isDefault: true,
      address: 'Calle Falsa 123',
    },
  });

  await prisma.category.upsert({
    where: { companyId_name: { companyId: company.id, name: 'General' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'General',
      description: 'Categoría por defecto',
    },
  });

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

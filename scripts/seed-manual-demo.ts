/**
 * Empresa de demo para generar las capturas de pantalla del Manual de
 * Usuario (`scripts/capture-manual-screenshots.ts`). Se corre UNA VEZ a
 * mano, nunca como parte de un build/deploy — reusa la misma "Empresa de
 * Prueba" (RUT 99.999.999-9) que ya crea `prisma/seed.ts`, solo le activa
 * TODOS los módulos para que el manual completo tenga algo que mostrar.
 *
 * Los datos transaccionales (productos, ventas, candidatas, etc.) NO se
 * crean acá con Prisma directo — eso violaría invariantes de negocio
 * (folios, Kardex/PMP) que solo los `service` reales garantizan. Los crea
 * el propio script de Playwright navegando los formularios reales de la
 * app, como lo haría cualquier usuario.
 *
 * Uso: npx tsx scripts/seed-manual-demo.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { formatRut } from '../src/lib/chile/rut';
import bcrypt from 'bcryptjs';
import type { CompanyFeatureFlags } from '../src/lib/auth/modules';
import { MANUAL_DEMO_ADMIN_EMAIL, MANUAL_DEMO_ADMIN_PASSWORD } from './manual-demo-constants';
import { assertScriptCanRun } from './lib/guard-production';

const COMPANY_RUT = formatRut('99999999-9');

const ALL_FEATURES_ON: CompanyFeatureFlags = {
  hasInventory: true,
  hasPmpCosting: true,
  hasDteBilling: true,
  hasPurchases: true,
  hasTreasury: true,
  hasAdvancedReports: true,
  hasMultipleWarehouses: true,
  hasPos: true,
  hasAccounting: true,
  hasCrm: true,
  hasEventProjects: true,
  hasSponsorships: true,
  hasFeeDocuments: true,
  hasCandidates: true,
  hasOrgChart: true,
  hasLiveProduction: true,
  hasJudging: true,
  hasMultiCompany: true,
  hasBudgets: true,
  hasPromissoryNotes: true,
  hasInstallmentPlans: true,
  hasTicketing: true,
  hasPublicVoting: true,
  hasIntelligence: true,
  hasSalesPipeline: true,
  hasPayroll: true,
  hasFixedAssets: true,
  hasExpenseReports: true,
  hasProduction: true,
  hasServiceDesk: true,
};

async function main() {
  assertScriptCanRun('scripts/seed-manual-demo.ts');
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

  const passwordHash = await bcrypt.hash(MANUAL_DEMO_ADMIN_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: MANUAL_DEMO_ADMIN_EMAIL },
    update: { passwordHash, role: 'OWNER', companyId: company.id },
    create: {
      email: MANUAL_DEMO_ADMIN_EMAIL,
      passwordHash,
      name: 'Admin Demo',
      role: 'OWNER',
      companyId: company.id,
    },
  });

  await prisma.companyFeatures.upsert({
    where: { companyId: company.id },
    update: ALL_FEATURES_ON,
    create: { companyId: company.id, ...ALL_FEATURES_ON },
  });

  await prisma.warehouse.upsert({
    where: { companyId_code: { companyId: company.id, code: 'CENTRAL' } },
    update: {},
    create: { companyId: company.id, name: 'Bodega Principal', code: 'CENTRAL', isDefault: true, address: 'Calle Falsa 123' },
  });

  await prisma.category.upsert({
    where: { companyId_name: { companyId: company.id, name: 'General' } },
    update: {},
    create: { companyId: company.id, name: 'General', description: 'Categoría por defecto' },
  });

  console.log('Empresa de demo lista:', company.id, '— login:', MANUAL_DEMO_ADMIN_EMAIL, '/', MANUAL_DEMO_ADMIN_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

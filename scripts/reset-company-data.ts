import 'dotenv/config';
import os from 'node:os';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizeSslMode } from '../src/lib/prisma';
import { seedChartOfAccounts } from '../src/modules/accounting/chart-of-accounts';
import { assertScriptCanRun } from './lib/guard-production';
import {
  KEPT_TENANT_TABLES,
  ResetPlanError,
  buildResetPlan,
  collectRealDataSignals,
  confirmationMatches,
  countRows,
  loadSchemaFacts,
  matchCompanies,
  parseResetArgs,
  runReset,
} from './lib/company-reset';

/**
 * Deja una empresa sin los datos que guardó (ventas, inventario, contabilidad,
 * contactos, bodegas, cajas, sitios…) para empezar a operar de verdad, y CONSERVA
 * la empresa, sus usuarios y roles, sus módulos contratados y su configuración
 * (`CompanySettings`: giro, año fiscal, credenciales, lista de IPs).
 *
 * Al terminar vuelve a dejar lo mínimo que tiene una empresa recién creada:
 * la «Bodega Principal» y, si tiene Contabilidad, el plan de cuentas base.
 *
 * Es IRREVERSIBLE y la `DATABASE_URL` local es la MISMA base que producción
 * (CLAUDE.md, sección 5). Por eso:
 *  - sin `--commit` solo simula: cuenta lo que se borraría y no escribe nada;
 *  - con `--commit` hay que repetir la razón social con `--confirmar`;
 *  - todo ocurre en UNA transacción: si algo no cuadra, no se borra nada;
 *  - si hay cosas que no parecen de prueba (CAF del SII, cobros reales) exige
 *    además `--acepto-perder-datos-reales`.
 *
 * Antes de correrlo en firme: respaldo (`GET /api/backup/company`, o un punto de
 * restauración de Neon). Los archivos subidos (fotos, adjuntos) NO se borran del
 * almacenamiento; quedan sin uso.
 *
 * Uso:
 *   npx tsx scripts/reset-company-data.ts                                   (lista las empresas)
 *   npx tsx scripts/reset-company-data.ts --empresa "76.123.456-7"          (simulación)
 *   npx tsx scripts/reset-company-data.ts --empresa "76.123.456-7" --commit --confirmar "Razón Social"
 */

// Cliente propio: el de la app imprime cada consulta fuera de producción y aquí serían cientos de líneas.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: normalizeSslMode(process.env.DATABASE_URL), max: 2, connectionTimeoutMillis: 15_000 }),
  log: ['warn', 'error'],
});

const HELP = `Reseteo de datos de una empresa.

  --empresa <RUT | razón social | id>   empresa a resetear (sin esto, lista las empresas)
  --commit                              ejecuta de verdad (sin esto solo simula)
  --confirmar "<razón social>"          obligatorio con --commit: la razón social, escrita a mano
  --acepto-perder-datos-reales          obligatorio si la simulación avisa de CAF, cobros o documentos enviados al SII
  --ayuda                               esta ayuda
`;

function describeDatabase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.pathname}`;
  } catch {
    return '(DATABASE_URL no válida)';
  }
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

async function listCompanies() {
  const companies = await prisma.company.findMany({
    select: { id: true, rut: true, businessName: true, status: true, _count: { select: { users: true } } },
    orderBy: { businessName: 'asc' },
  });
  console.log(`Base de datos: ${describeDatabase()}\n`);
  console.log('Empresas:');
  for (const company of companies) {
    console.log(`  ${company.businessName} · RUT ${company.rut} · ${company.status} · ${company._count.users} usuario(s) · id ${company.id}`);
  }
  console.log('\nElige una con --empresa "<RUT>" para ver qué se borraría.');
}

async function main() {
  assertScriptCanRun('reset-company-data');
  let args;
  try {
    args = parseResetArgs(process.argv.slice(2));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (!args.company) {
    await listCompanies();
    return;
  }

  const all = await prisma.company.findMany({ select: { id: true, rut: true, businessName: true, status: true } });
  const matches = matchCompanies(all, args.company);
  if (matches.length === 0) return fail(`No encontré ninguna empresa para «${args.company}». Corre el script sin opciones para ver la lista.`);
  if (matches.length > 1) return fail(`«${args.company}» coincide con ${matches.length} empresas. Usa el RUT o el id.`);
  const company = matches[0];

  const facts = await loadSchemaFacts(prisma);
  let plan;
  try {
    plan = buildResetPlan({ tenantTables: facts.tenantTables, foreignKeys: facts.foreignKeys });
  } catch (error) {
    if (error instanceof ResetPlanError) return fail(`No se puede armar un borrado seguro: ${error.message}\nNo se tocó nada.`);
    throw error;
  }

  const counts = await countRows(prisma, plan.deleteOrder, company.id);
  const kept = await countRows(prisma, KEPT_TENANT_TABLES.filter((table) => facts.tenantTables.includes(table)), company.id);
  const signals = await collectRealDataSignals(prisma, company.id);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  console.log(`Base de datos: ${describeDatabase()}`);
  console.log(`Empresa:       ${company.businessName} · RUT ${company.rut} · ${company.status}\n`);
  console.log(`Se borrarían ${total.toLocaleString('es-CL')} filas en ${Object.keys(counts).length} tablas:`);
  for (const [table, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(8)}  ${table}`);
  console.log('\nSe conserva (no se toca):');
  console.log('  la empresa, sus módulos contratados (CompanyFeatures) y su configuración (CompanySettings)');
  for (const table of ['User', 'CustomRole', 'Invitation', 'CompanyMembership']) console.log(`  ${String(kept[table] ?? 0).padStart(8)}  ${table}`);
  console.log('\nAl terminar se vuelve a crear la «Bodega Principal» y, si tiene Contabilidad, el plan de cuentas base.');

  if (signals.length > 0) {
    console.log('\n⚠ Esto no parece solo de prueba:');
    for (const signal of signals) console.log(`  · ${signal.count} ${signal.label}`);
  }

  if (!args.commit) {
    console.log('\nSimulación: no se borró nada.');
    console.log(`Para ejecutarlo de verdad: --commit --confirmar "${company.businessName}"${signals.length > 0 ? ' --acepto-perder-datos-reales' : ''}`);
    return;
  }

  if (!confirmationMatches(company.businessName, args.confirm)) {
    return fail(`Para ejecutar hay que escribir la razón social exacta: --confirmar "${company.businessName}"`);
  }
  if (signals.length > 0 && !args.acceptRealData) {
    return fail('Hay datos que no parecen de prueba (arriba). Si de verdad quieres perderlos, agrega --acepto-perder-datos-reales.');
  }

  console.log('\nBorrando…');
  const outcome = await prisma.$transaction(
    async (tx) =>
      runReset(tx, {
        companyId: company.id,
        plan,
        facts,
        afterDelete: async (inner) => {
          await inner.warehouse.create({ data: { companyId: company.id, name: 'Bodega Principal', code: 'PRINCIPAL', isDefault: true } });
          const features = await inner.companyFeatures.findUnique({ where: { companyId: company.id }, select: { hasAccounting: true } });
          if (features?.hasAccounting) {
            const settings = await inner.companySettings.findUnique({ where: { companyId: company.id }, select: { industryType: true } });
            await seedChartOfAccounts(inner, company.id, settings?.industryType ?? 'COMMERCE');
          }
          await inner.platformAuditLog.create({
            data: {
              action: 'company.data_reset',
              companyId: company.id,
              companyRut: company.rut,
              companyBusinessName: company.businessName,
              performedByUserId: 'script:reset-company-data',
              performedByEmail: `${os.userInfo().username}@${os.hostname()}`,
              metadata: { tables: Object.keys(counts).length, rows: total, deleted: counts, realDataSignals: signals.map((s) => `${s.count} ${s.label}`) },
            },
          });
        },
      }),
    { maxWait: 30_000, timeout: 10 * 60_000 }
  );

  console.log(`\n✔ Listo: se borraron ${outcome.totalRows.toLocaleString('es-CL')} filas de ${company.businessName}.`);
  console.log('  Usuarios, roles, módulos y configuración quedaron como estaban.');
  console.log('  Se dejó la «Bodega Principal» y, si corresponde, el plan de cuentas base.');
  console.log('  Los archivos subidos (fotos, adjuntos) siguen en el almacenamiento, sin uso.');
}

main()
  .catch((error) => {
    console.error('\n✖ No se pudo completar. La transacción se revirtió: no se borró nada.\n', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

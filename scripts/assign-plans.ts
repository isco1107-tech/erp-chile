import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { assertScriptCanRun } from './lib/guard-production';
import { toFeatureFlags } from '../src/lib/auth/modules';
import { MAX_WAREHOUSES, inferPlanName } from '../src/lib/pricing/presets';
import { formatCurrency } from '../src/lib/chile/tax';

/**
 * Asigna a cada empresa existente el plan que le corresponde según los
 * módulos que tiene encendidos (`inferPlanName`: el plan de menor precio de
 * lista cuyos módulos tiene todos) y baja a 5 el tope de bodegas de quien lo
 * tenga más alto. NO toca módulos, límites de usuarios ni estado.
 *
 * Modo simulación por defecto: solo informa. Escribir exige `--commit`, y la
 * `DATABASE_URL` local es la MISMA base que producción (CLAUDE.md, sección 5):
 * revisar el informe de simulación antes de correrlo en firme.
 *
 * Uso:
 *   npx tsx scripts/assign-plans.ts             (simulación)
 *   npx tsx scripts/assign-plans.ts --commit    (en firme)
 */

async function main() {
  assertScriptCanRun('assign-plans');
  const commit = process.argv.slice(2).includes('--commit');

  const companies = await prisma.company.findMany({
    select: { id: true, businessName: true, planName: true, maxUsers: true, maxWarehouses: true, features: true },
    orderBy: { businessName: 'asc' },
  });

  let changed = 0;
  for (const company of companies) {
    const fit = inferPlanName(toFeatureFlags(company.features), company.maxUsers);
    const newMaxWarehouses = Math.min(company.maxWarehouses, MAX_WAREHOUSES);
    const planChanges = fit.planName !== company.planName;
    const warehousesChange = newMaxWarehouses !== company.maxWarehouses;

    const extras = fit.price.extras.length > 0 ? ` + ${fit.price.extras.map((m) => m.label).join(', ')}` : '';
    const users = fit.price.extraUsers > 0 ? ` + ${fit.price.extraUsers} usuario(s) adicional(es)` : '';
    console.log(
      `${company.businessName}: ${company.planName} → ${fit.planName}${extras}${users} (${formatCurrency(fit.price.net)} + IVA/mes)` +
        (warehousesChange ? ` · bodegas ${company.maxWarehouses} → ${newMaxWarehouses}` : '') +
        (planChanges || warehousesChange ? '' : ' · sin cambios')
    );
    if (!planChanges && !warehousesChange) continue;
    changed += 1;
    if (commit) {
      await prisma.company.updateMany({
        where: { id: company.id },
        data: { planName: fit.planName, maxWarehouses: newMaxWarehouses },
      });
    }
  }

  console.log(`\n${companies.length} empresa(s); ${changed} ${commit ? 'actualizada(s)' : 'se actualizarían (simulación: no se escribió nada; usa --commit)'}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

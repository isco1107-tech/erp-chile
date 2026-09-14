import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { purgeRejectedCandidates } from '../src/modules/candidates/services/candidates.service';
import { assertScriptCanRun } from './lib/guard-production';

/**
 * Purga por retención (Sección 7 del módulo de postulaciones): elimina
 * postulaciones `REJECTED` con más de N meses desde su última actualización,
 * junto con sus archivos físicos en Blob. Misma lógica que usa el cron real
 * en `app/api/candidates/purge-retention/cron/route.ts` — este script es
 * para correrla a mano y ver el resultado antes de confiar en el cron.
 *
 * N es configurable, nunca hardcodeado — por línea de comando o por
 * `CANDIDATE_RETENTION_MONTHS` en el entorno (por defecto 12).
 *
 * Modo simulación por defecto (mismo criterio que `backfill-accounting.ts`,
 * dado que este proyecto corre contra una base compartida dev=prod): sin
 * `--commit` solo cuenta cuántas candidatas purgaría, sin borrar nada.
 *
 * Uso:
 *   npx tsx scripts/purge-rejected-candidates.ts --months=12                                  (simulación, todas las empresas)
 *   npx tsx scripts/purge-rejected-candidates.ts --months=12 --company=<companyId>             (simulación, una empresa)
 *   npx tsx scripts/purge-rejected-candidates.ts --months=12 --company=<companyId> --commit    (en firme, una empresa)
 *   npx tsx scripts/purge-rejected-candidates.ts --months=12 --commit                          (en firme, TODAS las empresas)
 */

function parseArgs(): { months: number; commit: boolean; companyId?: string } {
  const args = process.argv.slice(2);
  const monthsArg = args.find((a) => a.startsWith('--months'));
  const explicitMonths = monthsArg?.includes('=') ? Number(monthsArg.split('=')[1]) : undefined;
  const months = explicitMonths ?? Number(process.env.CANDIDATE_RETENTION_MONTHS ?? 12);
  const companyArg = args.find((a) => a.startsWith('--company='));
  return { months, commit: args.includes('--commit'), companyId: companyArg?.split('=')[1] };
}

async function main() {
  assertScriptCanRun('scripts/purge-rejected-candidates.ts');
  const { months, commit, companyId } = parseArgs();
  if (!Number.isFinite(months) || months <= 0) {
    console.error('Meses de retención inválidos. Usa --months=12 o CANDIDATE_RETENTION_MONTHS.');
    process.exit(1);
  }

  if (!commit) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const eligible = await prisma.candidate.count({ where: { status: 'REJECTED', updatedAt: { lt: cutoff }, ...(companyId ? { companyId } : {}) } });
    console.log(`[purge-rejected-candidates] Retención: ${months} meses (corte: ${cutoff.toISOString()})${companyId ? ` — empresa ${companyId}` : ' — TODAS las empresas'}`);
    console.log(`[purge-rejected-candidates] Candidatas descartadas elegibles: ${eligible}`);
    console.log('[purge-rejected-candidates] Simulación — no se borró nada. Ejecuta con --commit para aplicar.');
    return;
  }

  // Nunca se registra el nombre/RUT de las candidatas purgadas (Sección 7:
  // "nunca escribas datos de la candidata en logs") — solo el conteo.
  const result = await purgeRejectedCandidates(months, companyId);
  console.log(`[purge-rejected-candidates] Retención: ${months} meses${companyId ? ` — empresa ${companyId}` : ' — TODAS las empresas'}`);
  console.log(`[purge-rejected-candidates] Purgadas: ${result.deleted}/${result.eligible}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/** Reencadena la escaleta para que el primer bloque parta hace N minutos (demo del modo show). */
import 'dotenv/config';
import { prisma } from '../../src/lib/prisma';
import { assertLocalDatabase } from '../lib/guard-production';
import { chainStageSchedule } from '../../src/modules/production/services/production.service';
assertLocalDatabase('rechain-show');
async function main() {
  const minutes = Number(process.argv[2] ?? 44);
  const p = await prisma.project.findFirstOrThrow({ where: { code: 'FIESTA-PRIMAVERA-TEMUCO' }, select: { id: true, companyId: true } });
  await chainStageSchedule(p.companyId, p.id, new Date(Date.now() - minutes * 60_000));
  await prisma.stageTimelineItem.updateMany({ where: { projectId: p.id, companyId: p.companyId, actualStartedAt: { not: null } }, data: {} });
  console.log('escaleta reencadenada');
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

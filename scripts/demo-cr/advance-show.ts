/** Simula el show en vivo: avanza N bloques de la escaleta del certamen principal. */
import 'dotenv/config';
import { prisma } from '../../src/lib/prisma';
import { assertLocalDatabase } from '../lib/guard-production';
import { advanceShow } from '../../src/modules/production/services/production.service';
assertLocalDatabase('advance-show');
async function main() {
  const n = Number(process.argv[2] ?? 5);
  const p = await prisma.project.findFirstOrThrow({ where: { code: 'FIESTA-PRIMAVERA-TEMUCO' }, select: { id: true, companyId: true } });
  for (let i = 0; i < n; i++) await advanceShow(p.companyId, p.id);
  console.log('bloques avanzados:', n);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

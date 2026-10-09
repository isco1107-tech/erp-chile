/** Mide el respaldo completo de la empresa de volumen (solo base LOCAL). */
import { prisma } from '../../src/lib/prisma';
import { streamCompanyBackup } from '../../src/modules/backup/services/company-backup.service';
import { assertLocalDatabase } from './shared';

assertLocalDatabase();

(async () => {
  const company = await prisma.company.findFirstOrThrow({ where: { rut: '99.999.999-9' } });
  const started = performance.now();
  let bytes = 0;
  for await (const chunk of streamCompanyBackup(company.id)) bytes += chunk.length;
  console.log(`respaldo: ${(bytes / 1024 / 1024).toFixed(1)} MB en ${Math.round(performance.now() - started)} ms`);
  await prisma.$disconnect();
})();

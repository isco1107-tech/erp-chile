/** Ids y tokens de la demo (para el script de capturas). Genera el portal de un auspiciador si falta. */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';
import { assertLocalDatabase } from '../lib/guard-production';
import { getOrCreatePortalToken } from '../../src/modules/sponsorships/services/sponsorships.service';

assertLocalDatabase('export-ids');

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error('Uso: export-ids.ts <archivo.json>');
  const company = await prisma.company.findFirstOrThrow({ where: { businessName: { contains: 'CR Producciones' } }, select: { id: true } });
  const companyId = company.id;
  const projects = await prisma.project.findMany({ where: { companyId }, select: { id: true, code: true, name: true, publicSlug: true, ticketSalesToken: true, voteSalesToken: true, candidateRegistrationToken: true }, orderBy: { createdAt: 'asc' } });
  const fiesta = projects.find((p) => p.code === 'FIESTA-PRIMAVERA-TEMUCO')!;
  const judges = await prisma.judgeAssignment.findMany({ where: { companyId, projectId: fiesta.id }, select: { judgeName: true, accessToken: true }, orderBy: { createdAt: 'asc' } });
  const contract = await prisma.sponsorshipContract.findFirstOrThrow({ where: { companyId, projectId: fiesta.id, tier: 'TITULAR_MAIN_SPONSOR' }, select: { id: true } });
  const portalToken = await getOrCreatePortalToken(companyId, contract.id);
  const contracts = await prisma.sponsorshipContract.findMany({ where: { companyId, projectId: fiesta.id }, select: { id: true, tier: true, contact: { select: { razonSocial: true } } } });
  const candidates = await prisma.candidate.findMany({ where: { companyId, projectId: fiesta.id }, select: { id: true, stageName: true, status: true, candidateNumber: true }, orderBy: { candidateNumber: 'asc' } });
  const sessions = await prisma.candidateSession.findMany({ where: { companyId, projectId: fiesta.id }, select: { id: true, activityType: true, date: true }, orderBy: { date: 'asc' } });
  writeFileSync(out, JSON.stringify({ companyId, projects, judges, portalToken, contracts, candidates, sessions }, null, 2));
  console.log('ids →', out);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

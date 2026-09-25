import 'server-only';

import { prisma } from '@/lib/prisma';
import { SPONSORSHIP_TIER_LABELS } from '@/modules/sponsorships/schema';
import {
  CANDIDATE_STATUSES_REQUIRING_CONTRACT,
  candidateChecklistItem,
  sortChecklist,
  sponsorChecklistItem,
  summarizeByProject,
  summarizeContracts,
  type ContractChecklistItem,
  type ContractsSummary,
  type ProjectContractsSummary,
} from '@/lib/events/contracts-checklist';

/**
 * Lectura del checklist de contratos firmados (ver
 * `src/lib/events/contracts-checklist.ts`). Solo consulta lo que el usuario
 * puede ver: quien no tiene Candidatas (o su permiso) no recibe contratos de
 * imagen, y lo mismo con Auspicios. Nada se persiste.
 */

export interface ContractsOverview {
  items: ContractChecklistItem[];
  summary: ContractsSummary;
  byProject: ProjectContractsSummary[];
  includes: { candidates: boolean; sponsors: boolean };
}

export interface ContractsOverviewScope {
  candidates: boolean;
  sponsors: boolean;
  projectId?: string;
}

export async function getContractsOverview(companyId: string, scope: ContractsOverviewScope): Promise<ContractsOverview> {
  const now = new Date();
  const projectFilter = scope.projectId ? { projectId: scope.projectId } : {};

  const [candidates, sponsors] = await Promise.all([
    scope.candidates
      ? prisma.candidate.findMany({
          where: {
            companyId,
            ...projectFilter,
            status: { notIn: ['WITHDRAWN', 'REJECTED'] },
            // Las que exigen contrato, o cualquiera que ya tenga uno generado.
            OR: [
              { status: { in: [...CANDIDATE_STATUSES_REQUIRING_CONTRACT] } },
              { documents: { some: { companyId, documentType: 'CONTRACT_IMAGE' } } },
            ],
          },
          select: {
            id: true,
            fullName: true,
            stageName: true,
            status: true,
            candidateNumber: true,
            project: { select: { id: true, name: true } },
            documents: {
              where: { companyId, documentType: 'CONTRACT_IMAGE' },
              select: { createdAt: true, signedAt: true, expiresAt: true, zapsignSignUrl: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        })
      : Promise.resolve([]),
    scope.sponsors
      ? prisma.sponsorshipContract.findMany({
          where: {
            companyId,
            ...projectFilter,
            status: { not: 'CANCELLED' },
            OR: [{ status: { in: ['CONFIRMED', 'COMPLETED'] } }, { agreementFileUrl: { not: null } }],
          },
          select: {
            id: true,
            status: true,
            tier: true,
            cashAmount: true,
            agreementFileUrl: true,
            agreementGeneratedAt: true,
            agreementSignedAt: true,
            contact: { select: { razonSocial: true, nombreFantasia: true } },
            project: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const items: ContractChecklistItem[] = [];
  for (const candidate of candidates) {
    const item = candidateChecklistItem({ ...candidate, contracts: candidate.documents }, now);
    if (item) items.push(item);
  }
  for (const sponsor of sponsors) {
    const item = sponsorChecklistItem({
        ...sponsor,
        tierLabel: SPONSORSHIP_TIER_LABELS[sponsor.tier],
        contactName: sponsor.contact.nombreFantasia ?? sponsor.contact.razonSocial,
      }, now);
    if (item) items.push(item);
  }

  const sorted = sortChecklist(items);
  return {
    items: sorted,
    summary: summarizeContracts(sorted),
    byProject: summarizeByProject(sorted),
    includes: { candidates: scope.candidates, sponsors: scope.sponsors },
  };
}

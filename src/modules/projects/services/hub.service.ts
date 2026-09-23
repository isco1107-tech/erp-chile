import 'server-only';

import type { CandidateStatus, Project } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import { buildPageantReadiness, type ReadinessReport } from '@/lib/events/readiness';
import { getProjectFinancialSummary, type ProjectFinancialSummary } from '@/lib/services/projects';

/**
 * Centro de mando de un certamen: lee en paralelo cada módulo contratado y
 * arma los indicadores y el checklist "¿listos para la gala?". Solo consulta
 * los módulos que la empresa tiene: a quien no compró Jurado no se le
 * consulta ni se le exige nada de Jurado. Nada se persiste.
 */

const OFFICIAL: CandidateStatus[] = ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'];
const TO_REVIEW: CandidateStatus[] = ['APPLICANT', 'UNDER_REVIEW', 'CALLED_TO_CASTING'];

export interface PageantHub {
  project: Project;
  finance: ProjectFinancialSummary;
  readiness: ReadinessReport;
  candidates: { byStatus: Record<string, number>; official: number; toReview: number; numbered: number; withPhoto: number; contractsSigned: number } | null;
  judging: { rounds: number; completedRounds: number; judges: number; submittedScores: number; winnerName: string | null } | null;
  production: { stageBlocks: number; stageDone: number; stageMinutes: number; wardrobeItems: number; wardrobeReady: number; accreditations: number; checkedIn: number } | null;
  sponsorships: {
    contracts: number;
    confirmed: number;
    cashCommitted: number;
    cashCollected: number;
    barter: number;
    deliverablesTotal: number;
    deliverablesDone: number;
    deliverablesOverdue: number;
    packages: number;
    topSponsors: Array<{ name: string; tier: string; amount: number }>;
  } | null;
  ticketing: { ticketTypes: number; ticketsSold: number; revenue: number; pendingOrders: number; checkedIn: number; capacity: number | null } | null;
  voting: { votes: number; revenue: number; leader: { name: string; votes: number } | null } | null;
  crm: { openDeals: number; openAmount: number; weighted: number; wonAmount: number } | null;
  links: { registration: string | null; registrationOpen: boolean; tickets: string | null; voting: string | null; site: string | null };
}

export async function getPageantHub(companyId: string, projectId: string, features: CompanyFeatureFlags): Promise<PageantHub | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } });
  if (!project) return null;
  const now = new Date();
  const where = { companyId, projectId };

  const [finance, candidates, judging, production, sponsorships, ticketing, voting, crm] = await Promise.all([
    getProjectFinancialSummary(companyId, projectId),

    features.hasCandidates
      ? Promise.all([
          prisma.candidate.groupBy({ by: ['status'], where, _count: { _all: true } }),
          prisma.candidate.count({ where: { ...where, status: { in: OFFICIAL }, candidateNumber: { not: null } } }),
          prisma.candidate.count({ where: { ...where, status: { in: OFFICIAL }, photoUrl: { not: null } } }),
          prisma.candidate.count({
            where: { ...where, status: { in: OFFICIAL }, documents: { some: { companyId, documentType: 'CONTRACT_IMAGE', signedAt: { not: null } } } },
          }),
        ]).then(([groups, numbered, withPhoto, contractsSigned]) => {
          const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all])) as Record<string, number>;
          const sum = (list: CandidateStatus[]) => list.reduce((s, st) => s + (byStatus[st] ?? 0), 0);
          return { byStatus, official: sum(OFFICIAL), toReview: sum(TO_REVIEW), numbered, withPhoto, contractsSigned };
        })
      : Promise.resolve(null),

    features.hasJudging
      ? Promise.all([
          prisma.competitionRound.findMany({ where, select: { id: true, status: true, isFinalRound: true, categories: { select: { weightBps: true } } } }),
          prisma.judgeAssignment.count({ where }),
          prisma.scoreSheet.count({ where: { companyId, round: { projectId }, status: 'SUBMITTED' } }),
          prisma.candidate.findFirst({ where: { ...where, status: 'WINNER' }, select: { fullName: true, stageName: true } }),
        ]).then(([rounds, judges, submittedScores, winner]) => ({
          rounds,
          judges,
          submittedScores,
          winnerName: winner ? (winner.stageName ?? winner.fullName) : null,
        }))
      : Promise.resolve(null),

    features.hasLiveProduction
      ? Promise.all([
          prisma.stageTimelineItem.findMany({ where, select: { status: true, durationMinutes: true } }),
          prisma.wardrobeItem.groupBy({ by: ['status'], where, _count: { _all: true } }),
          prisma.staffAccreditation.count({ where }),
          prisma.staffAccreditation.count({ where: { ...where, checkedInAt: { not: null } } }),
        ])
      : Promise.resolve(null),

    features.hasSponsorships
      ? Promise.all([
          prisma.sponsorshipContract.findMany({
            where: { ...where, status: { not: 'CANCELLED' } },
            select: {
              status: true,
              tier: true,
              cashAmount: true,
              paidAmount: true,
              barterValuation: true,
              agreementGeneratedAt: true,
              agreementSignedAt: true,
              contact: { select: { razonSocial: true, nombreFantasia: true } },
              deliverables: { select: { isCompleted: true, dueDate: true } },
            },
          }),
          prisma.sponsorshipPackage.count({ where }),
        ])
      : Promise.resolve(null),

    features.hasTicketing
      ? Promise.all([
          prisma.ticketType.findMany({ where, select: { quantityAvailable: true } }),
          prisma.ticketSale.aggregate({ where: { ...where, paymentStatus: 'PAID' }, _sum: { quantity: true, paidAmount: true } }),
          prisma.ticketSale.count({ where: { ...where, paymentStatus: 'UNPAID' } }),
          prisma.ticketSale.aggregate({ where: { ...where, checkedInAt: { not: null } }, _sum: { quantity: true } }),
        ])
      : Promise.resolve(null),

    features.hasPublicVoting
      ? Promise.all([
          prisma.voteOrder.aggregate({ where: { ...where, paymentStatus: 'PAID' }, _sum: { voteCount: true, paidAmount: true } }),
          prisma.voteOrder.groupBy({ by: ['candidateId'], where: { ...where, paymentStatus: 'PAID' }, _sum: { voteCount: true }, orderBy: { _sum: { voteCount: 'desc' } }, take: 1 }),
        ])
      : Promise.resolve(null),

    features.hasSalesPipeline
      ? prisma.opportunity.findMany({ where: { ...where, stage: { notIn: ['LOST'] } }, select: { stage: true, amount: true, probability: true } })
      : Promise.resolve(null),
  ]);

  // ── Normalización por módulo ────────────────────────────────────────────
  const judgingData = judging
    ? {
        rounds: judging.rounds.length,
        completedRounds: judging.rounds.filter((r) => r.status === 'COMPLETED').length,
        judges: judging.judges,
        submittedScores: judging.submittedScores,
        winnerName: judging.winnerName,
      }
    : null;

  const productionData = production
    ? (() => {
        const [blocks, wardrobeGroups, accreditations, checkedIn] = production;
        const wardrobeCount = (status?: string) => wardrobeGroups.filter((g) => !status || g.status === status).reduce((s, g) => s + g._count._all, 0);
        return {
          stageBlocks: blocks.length,
          stageDone: blocks.filter((b) => b.status === 'DONE').length,
          stageMinutes: blocks.filter((b) => b.status !== 'SKIPPED').reduce((s, b) => s + b.durationMinutes, 0),
          wardrobeItems: wardrobeCount(),
          wardrobeReady: wardrobeCount() - wardrobeCount('PENDING'),
          accreditations,
          checkedIn,
        };
      })()
    : null;

  const sponsorshipData = sponsorships
    ? (() => {
        const [contracts, packages] = sponsorships;
        const live = contracts.filter((c) => c.status === 'CONFIRMED' || c.status === 'COMPLETED');
        const deliverables = contracts.flatMap((c) => c.deliverables);
        return {
          contracts: contracts.length,
          confirmed: live.length,
          cashCommitted: live.reduce((s, c) => s + c.cashAmount, 0),
          cashCollected: contracts.reduce((s, c) => s + c.paidAmount, 0),
          barter: live.reduce((s, c) => s + c.barterValuation, 0),
          deliverablesTotal: deliverables.length,
          deliverablesDone: deliverables.filter((d) => d.isCompleted).length,
          deliverablesOverdue: deliverables.filter((d) => !d.isCompleted && d.dueDate && d.dueDate < now).length,
          agreementsPending: contracts.filter((c) => c.agreementGeneratedAt && !c.agreementSignedAt).length,
          packages,
          topSponsors: [...live]
            .sort((a, b) => b.cashAmount + b.barterValuation - (a.cashAmount + a.barterValuation))
            .slice(0, 5)
            .map((c) => ({ name: c.contact.nombreFantasia || c.contact.razonSocial, tier: c.tier, amount: c.cashAmount + c.barterValuation })),
        };
      })()
    : null;

  const ticketingData = ticketing
    ? (() => {
        const [types, paid, pendingOrders, checked] = ticketing;
        const unlimited = types.some((t) => t.quantityAvailable === null);
        return {
          ticketTypes: types.length,
          ticketsSold: paid._sum.quantity ?? 0,
          revenue: paid._sum.paidAmount ?? 0,
          pendingOrders,
          checkedIn: checked._sum.quantity ?? 0,
          capacity: unlimited || types.length === 0 ? null : types.reduce((s, t) => s + (t.quantityAvailable ?? 0), 0),
        };
      })()
    : null;

  let votingData: PageantHub['voting'] = null;
  if (voting) {
    const [totals, leaderRows] = voting;
    const leaderRow = leaderRows[0];
    const leader = leaderRow
      ? await prisma.candidate.findFirst({ where: { id: leaderRow.candidateId, companyId }, select: { fullName: true, stageName: true } })
      : null;
    votingData = {
      votes: totals._sum.voteCount ?? 0,
      revenue: totals._sum.paidAmount ?? 0,
      leader: leader && leaderRow ? { name: leader.stageName ?? leader.fullName, votes: leaderRow._sum.voteCount ?? 0 } : null,
    };
  }

  const crmData = crm
    ? {
        openDeals: crm.filter((o) => o.stage !== 'WON').length,
        openAmount: crm.filter((o) => o.stage !== 'WON').reduce((s, o) => s + o.amount, 0),
        weighted: Math.round(crm.filter((o) => o.stage !== 'WON').reduce((s, o) => s + (o.amount * o.probability) / 100, 0)),
        wonAmount: crm.filter((o) => o.stage === 'WON').reduce((s, o) => s + o.amount, 0),
      }
    : null;

  const readiness = buildPageantReadiness({
    projectId,
    now,
    galaDate: project.galaDate,
    venueName: project.venueName,
    modules: {
      candidates: Boolean(candidates),
      judging: Boolean(judging),
      production: Boolean(production),
      sponsorships: Boolean(sponsorships),
      ticketing: Boolean(ticketing),
      voting: Boolean(voting),
      projects: features.hasEventProjects,
    },
    candidates: {
      official: candidates?.official ?? 0,
      applicantsToReview: candidates?.toReview ?? 0,
      numbered: candidates?.numbered ?? 0,
      withPhoto: candidates?.withPhoto ?? 0,
      contractsSigned: candidates?.contractsSigned ?? 0,
    },
    judging: {
      rounds: judging?.rounds.length ?? 0,
      roundsWithValidWeights: judging?.rounds.filter((r) => r.categories.length > 0 && r.categories.reduce((s, c) => s + c.weightBps, 0) === 10000).length ?? 0,
      hasFinalRound: judging?.rounds.some((r) => r.isFinalRound) ?? false,
      judges: judging?.judges ?? 0,
    },
    production: {
      stageBlocks: productionData?.stageBlocks ?? 0,
      wardrobeItems: productionData?.wardrobeItems ?? 0,
      wardrobeNotReady: (productionData?.wardrobeItems ?? 0) - (productionData?.wardrobeReady ?? 0),
      accreditations: productionData?.accreditations ?? 0,
    },
    sponsorships: {
      confirmed: sponsorshipData?.confirmed ?? 0,
      deliverablesTotal: sponsorshipData?.deliverablesTotal ?? 0,
      deliverablesDone: sponsorshipData?.deliverablesDone ?? 0,
      deliverablesOverdue: sponsorshipData?.deliverablesOverdue ?? 0,
      cashCommitted: sponsorshipData?.cashCommitted ?? 0,
      cashCollected: sponsorshipData?.cashCollected ?? 0,
      agreementsPendingSignature: sponsorshipData?.agreementsPending ?? 0,
    },
    ticketing: {
      ticketTypes: ticketingData?.ticketTypes ?? 0,
      linkActive: Boolean(project.ticketSalesToken),
      ordersPendingPayment: ticketingData?.pendingOrders ?? 0,
    },
    voting: { linkActive: Boolean(project.voteSalesToken) },
    site: { published: project.publicSiteEnabled && Boolean(project.publicSlug), hasCover: Boolean(project.coverImageUrl) },
  });

  return {
    project,
    finance,
    readiness,
    candidates,
    judging: judgingData,
    production: productionData,
    sponsorships: sponsorshipData
      ? {
          contracts: sponsorshipData.contracts,
          confirmed: sponsorshipData.confirmed,
          cashCommitted: sponsorshipData.cashCommitted,
          cashCollected: sponsorshipData.cashCollected,
          barter: sponsorshipData.barter,
          deliverablesTotal: sponsorshipData.deliverablesTotal,
          deliverablesDone: sponsorshipData.deliverablesDone,
          deliverablesOverdue: sponsorshipData.deliverablesOverdue,
          packages: sponsorshipData.packages,
          topSponsors: sponsorshipData.topSponsors,
        }
      : null,
    ticketing: ticketingData,
    voting: votingData,
    crm: crmData,
    links: {
      registration: features.hasCandidates && project.candidateRegistrationToken ? `/register/candidate/${project.candidateRegistrationToken}` : null,
      registrationOpen: project.registrationStatus === 'OPEN',
      tickets: features.hasTicketing && project.ticketSalesToken ? `/tickets/${project.ticketSalesToken}` : null,
      voting: features.hasPublicVoting && project.voteSalesToken ? `/votar/${project.voteSalesToken}` : null,
      site: project.publicSlug ? `/certamen/${project.publicSlug}` : null,
    },
  };
}

import 'server-only';

import type { CrmActivity, CrmPerson, Opportunity, OpportunityStage, Prisma, SponsorshipContract, SponsorshipTier } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import { startOfMonthSantiago, startOfTomorrowSantiago } from '@/lib/chile/timezone';
import { median } from '@/lib/intelligence/stats';
import { breakdownBy, forecastByMonth, normalizeTags, type BreakdownRow, type ForecastBucket } from '@/lib/crm/analytics';
import { SPONSORSHIP_TIER_LABELS } from '@/modules/sponsorships/schema';
import {
  DEAL_TYPE_LABELS,
  OPEN_STAGES,
  STAGE_DEFAULT_PROBABILITY,
  STALE_AFTER_DAYS,
  WEB_LEAD_SOURCE,
  type ActivityCreateInput,
  type ConvertToSponsorshipInput,
  type DealTypeKey,
  type MoveStageInput,
  type OpportunityCreateInput,
  type OpportunityUpdateInput,
  type PersonCreateInput,
  type PersonUpdateInput,
  type PipelineFilters,
  type PublicSponsorLeadInput,
} from '../schema';

/**
 * CRM comercial de una productora de certámenes. Toda lectura y escritura va
 * acotada por `companyId`, y las referencias que llegan del cliente
 * (contacto, persona, responsable, certamen, plan de auspicio, oportunidad)
 * se validan contra la misma empresa antes de usarse: un id de otro tenant
 * nunca debe poder colgarse de una oportunidad.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Contratos que ocupan un cupo del plan de auspicio. */
const SLOT_TAKING_STATUSES = ['CONFIRMED', 'COMPLETED'] as const;

const opportunityInclude = {
  contact: { select: { id: true, razonSocial: true, rut: true } },
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, code: true } },
  person: { select: { id: true, fullName: true, jobTitle: true } },
  package: { select: { id: true, name: true, tier: true } },
  activities: {
    where: { completedAt: null },
    orderBy: [{ dueAt: 'asc' as const }, { createdAt: 'asc' as const }],
    take: 1,
    select: { id: true, type: true, summary: true, dueAt: true },
  },
  _count: { select: { activities: true } },
} satisfies Prisma.OpportunityInclude;

export type OpportunityCard = Prisma.OpportunityGetPayload<{ include: typeof opportunityInclude }>;

const opportunityDetailInclude = {
  contact: { select: { id: true, razonSocial: true, rut: true, email: true, phone: true } },
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true, code: true } },
  person: { select: { id: true, fullName: true, jobTitle: true, email: true, phone: true, instagram: true, linkedinUrl: true, organizationName: true } },
  package: { select: { id: true, name: true, tier: true, price: true, benefits: true, maxSlots: true } },
  sponsorshipContract: { select: { id: true, status: true, tier: true } },
  activities: {
    orderBy: [{ completedAt: 'asc' as const }, { dueAt: 'asc' as const }, { createdAt: 'desc' as const }],
    include: { user: { select: { name: true } } },
  },
} satisfies Prisma.OpportunityInclude;

export type OpportunityDetail = Prisma.OpportunityGetPayload<{ include: typeof opportunityDetailInclude }>;

// ---------------------------------------------------------------------------
// Validación de referencias (multi-tenant)
// ---------------------------------------------------------------------------

async function assertContact(companyId: string, contactId: string | undefined | null): Promise<void> {
  if (!contactId) return;
  const found = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
  if (!found) throw new Error('El cliente seleccionado no existe en tu empresa');
}

async function assertOwner(companyId: string, userId: string | undefined | null): Promise<void> {
  if (!userId) return;
  const found = await prisma.user.findFirst({
    where: { id: userId, isActive: true, OR: [{ companyId }, { companyMemberships: { some: { companyId } } }] },
    select: { id: true },
  });
  if (!found) throw new Error('El responsable seleccionado no pertenece a tu empresa');
}

async function assertProject(companyId: string, projectId: string | undefined | null): Promise<void> {
  if (!projectId) return;
  const found = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!found) throw new Error('El certamen seleccionado no existe en tu empresa');
}

async function assertPerson(companyId: string, personId: string | undefined | null): Promise<void> {
  if (!personId) return;
  const found = await prisma.crmPerson.findFirst({ where: { id: personId, companyId }, select: { id: true } });
  if (!found) throw new Error('La persona de contacto no existe en tu empresa');
}

async function findPackage(companyId: string, packageId: string): Promise<{ id: string; projectId: string; tier: SponsorshipTier; price: number }> {
  const pkg = await prisma.sponsorshipPackage.findFirst({
    where: { id: packageId, companyId },
    select: { id: true, projectId: true, tier: true, price: true },
  });
  if (!pkg) throw new Error('El plan de auspicio seleccionado no existe en tu empresa');
  return pkg;
}

async function findOwned(companyId: string, id: string): Promise<Opportunity> {
  const opportunity = await prisma.opportunity.findFirst({ where: { id, companyId } });
  if (!opportunity) throw new Error('La oportunidad no existe o fue eliminada');
  return opportunity;
}

/**
 * Un plan de auspicio pertenece a un certamen: si el negocio trae plan, el
 * certamen sale del plan (o tiene que coincidir con él) y el nivel propuesto
 * se toma del plan cuando no viene uno explícito.
 */
async function resolveSponsorshipFields(
  companyId: string,
  projectId: string | null,
  packageId: string | null,
  tier: SponsorshipTier | null
): Promise<{ projectId: string | null; packageId: string | null; sponsorshipTier: SponsorshipTier | null }> {
  if (!packageId) return { projectId, packageId: null, sponsorshipTier: tier };
  const pkg = await findPackage(companyId, packageId);
  if (projectId && pkg.projectId !== projectId) throw new Error('El plan de auspicio elegido es de otro certamen');
  return { projectId: pkg.projectId, packageId: pkg.id, sponsorshipTier: tier ?? pkg.tier };
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

function filtersWhere(companyId: string, filters: PipelineFilters & { ownerUserId?: string }): Prisma.OpportunityWhereInput {
  return {
    companyId,
    ...(filters.ownerUserId ? { ownerUserId: filters.ownerUserId } : {}),
    ...(filters.dealType ? { dealType: filters.dealType } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.tag ? { tags: { has: filters.tag } } : {}),
  };
}

export async function listOpportunities(companyId: string, filters: PipelineFilters & { ownerUserId?: string } = {}): Promise<OpportunityCard[]> {
  const since = new Date(Date.now() - 90 * DAY_MS);
  return prisma.opportunity.findMany({
    where: {
      ...filtersWhere(companyId, filters),
      // Cerradas: solo las de los últimos 90 días, para que el tablero no se
      // vuelva un archivo histórico.
      OR: [{ stage: { in: OPEN_STAGES } }, ...(filters.includeClosed === false ? [] : [{ closedAt: { gte: since } }])],
    },
    include: opportunityInclude,
    orderBy: [{ expectedCloseDate: 'asc' }, { createdAt: 'desc' }],
    take: 500,
  });
}

/** Todas (abiertas y cerradas, sin ventana de 90 días) para la vista de lista y la exportación. */
export async function listAllOpportunities(companyId: string, filters: PipelineFilters & { ownerUserId?: string } = {}): Promise<OpportunityCard[]> {
  return prisma.opportunity.findMany({
    where: filtersWhere(companyId, filters),
    include: opportunityInclude,
    orderBy: [{ updatedAt: 'desc' }],
    take: 2000,
  });
}

export async function getOpportunity(companyId: string, id: string): Promise<OpportunityDetail | null> {
  return prisma.opportunity.findFirst({ where: { id, companyId }, include: opportunityDetailInclude });
}

export async function createOpportunity(companyId: string, input: OpportunityCreateInput): Promise<Opportunity> {
  await Promise.all([
    assertContact(companyId, input.contactId),
    assertOwner(companyId, input.ownerUserId),
    assertProject(companyId, input.projectId),
    assertPerson(companyId, input.personId),
  ]);
  const sponsorship = await resolveSponsorshipFields(companyId, input.projectId ?? null, input.packageId ?? null, input.sponsorshipTier ?? null);
  const dealType: DealTypeKey = input.dealType ?? (sponsorship.packageId || sponsorship.sponsorshipTier ? 'SPONSORSHIP' : 'OTHER');
  const closed = input.stage === 'WON' || input.stage === 'LOST';
  const isBarter = input.isBarter ?? false;

  return prisma.opportunity.create({
    data: {
      companyId,
      title: input.title,
      contactId: input.contactId ?? null,
      prospectName: input.contactId ? null : (input.prospectName ?? null),
      prospectEmail: input.prospectEmail ?? null,
      prospectPhone: input.prospectPhone ?? null,
      amount: input.amount,
      probability: input.probability ?? STAGE_DEFAULT_PROBABILITY[input.stage],
      stage: input.stage,
      source: input.source ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
      ownerUserId: input.ownerUserId ?? null,
      notes: input.notes ?? null,
      closedAt: closed ? new Date() : null,
      dealType,
      priority: input.priority ?? 'MEDIUM',
      projectId: sponsorship.projectId,
      packageId: sponsorship.packageId,
      sponsorshipTier: sponsorship.sponsorshipTier,
      isBarter,
      barterValuation: isBarter ? (input.barterValuation ?? 0) : 0,
      barterDescription: isBarter ? (input.barterDescription ?? null) : null,
      tags: normalizeTags(input.tags ?? []),
      personId: input.personId ?? null,
    },
  });
}

export async function updateOpportunity(companyId: string, id: string, input: OpportunityUpdateInput): Promise<Opportunity> {
  const existing = await findOwned(companyId, id);
  await Promise.all([
    assertContact(companyId, input.contactId),
    assertOwner(companyId, input.ownerUserId),
    assertProject(companyId, input.projectId),
    assertPerson(companyId, input.personId),
  ]);

  // Elegir un cliente reemplaza al prospecto y viceversa: una oportunidad
  // nunca queda apuntando a ambos, ni a ninguno.
  let party: { contactId?: string | null; prospectName?: string | null } = {};
  if (input.contactId) party = { contactId: input.contactId, prospectName: null };
  else if (input.contactId === null || input.prospectName !== undefined) {
    const prospectName = input.prospectName === undefined ? existing.prospectName : input.prospectName;
    if (!prospectName && (input.contactId === null || !existing.contactId)) {
      throw new Error('Elige un cliente existente o escribe el nombre del prospecto');
    }
    party = input.contactId === null ? { contactId: null, prospectName } : { prospectName };
  }

  const touchesSponsorship = input.projectId !== undefined || input.packageId !== undefined || input.sponsorshipTier !== undefined;
  const sponsorship = touchesSponsorship
    ? await resolveSponsorshipFields(
        companyId,
        input.projectId === undefined ? existing.projectId : input.projectId,
        input.packageId === undefined ? existing.packageId : input.packageId,
        input.sponsorshipTier === undefined ? existing.sponsorshipTier : input.sponsorshipTier
      )
    : {};

  const isBarter = input.isBarter ?? existing.isBarter;
  const data: Prisma.OpportunityUncheckedUpdateManyInput = {
    title: input.title,
    ...party,
    prospectEmail: input.prospectEmail,
    prospectPhone: input.prospectPhone,
    amount: input.amount,
    probability: input.probability,
    source: input.source,
    expectedCloseDate: input.expectedCloseDate,
    ownerUserId: input.ownerUserId,
    notes: input.notes,
    dealType: input.dealType,
    priority: input.priority,
    ...sponsorship,
    isBarter: input.isBarter,
    barterValuation: isBarter ? input.barterValuation : 0,
    barterDescription: isBarter ? input.barterDescription : null,
    tags: input.tags ? normalizeTags(input.tags) : undefined,
    personId: input.personId,
  };

  await prisma.opportunity.updateMany({ where: { id, companyId }, data });
  return findOwned(companyId, id);
}

/**
 * Mover de etapa reinicia el reloj de "días en etapa", ajusta la probabilidad
 * a la sugerida de la nueva etapa y fecha el cierre al ganar o perder.
 * Reabrir un negocio cerrado limpia la fecha de cierre y el motivo de pérdida.
 */
export async function moveOpportunityStage(companyId: string, id: string, input: MoveStageInput): Promise<{ before: Opportunity; after: Opportunity }> {
  const before = await findOwned(companyId, id);
  if (before.stage === input.stage) return { before, after: before };
  const closing = input.stage === 'WON' || input.stage === 'LOST';
  await prisma.opportunity.updateMany({
    where: { id, companyId },
    data: {
      stage: input.stage as OpportunityStage,
      probability: STAGE_DEFAULT_PROBABILITY[input.stage],
      stageChangedAt: new Date(),
      closedAt: closing ? new Date() : null,
      lostReason: input.stage === 'LOST' ? (input.lostReason ?? null) : null,
    },
  });
  return { before, after: await findOwned(companyId, id) };
}

export async function deleteOpportunity(companyId: string, id: string): Promise<void> {
  const result = await prisma.opportunity.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('La oportunidad no existe o fue eliminada');
}

// ---------------------------------------------------------------------------
// Conversión: negocio de auspicio ganado → contrato de auspicio
// ---------------------------------------------------------------------------

export class AlreadyConvertedError extends Error {}

/**
 * Crea el `SponsorshipContract` de un negocio de auspicio ganado, con los
 * beneficios del plan como checklist inicial de entregables, y deja el
 * contrato enlazado al negocio. Todo en una transacción: si algo falla no
 * queda un contrato huérfano ni un negocio marcado como convertido sin
 * contrato. El enlace se escribe con `updateMany` condicionado a
 * `sponsorshipContractId: null` para que dos clics simultáneos no creen dos
 * contratos.
 */
export async function convertToSponsorship(
  companyId: string,
  opportunityId: string,
  input: ConvertToSponsorshipInput
): Promise<{ contract: SponsorshipContract; opportunity: Opportunity }> {
  const opportunity = await findOwned(companyId, opportunityId);
  if (opportunity.sponsorshipContractId) throw new AlreadyConvertedError('Este negocio ya se convirtió en contrato de auspicio');
  if (opportunity.stage !== 'WON') throw new Error('Solo un negocio ganado se puede convertir en contrato');
  if (opportunity.dealType !== 'SPONSORSHIP') throw new Error('Solo los negocios de tipo Auspicio se convierten en contrato de auspicio');
  if (!opportunity.projectId) throw new Error('Asigna el certamen al negocio antes de convertirlo');

  const contactId = input.contactId ?? opportunity.contactId;
  if (!contactId) throw new Error('Elige la ficha de la marca (con RUT) para el contrato');
  await Promise.all([assertContact(companyId, contactId), assertProject(companyId, opportunity.projectId)]);

  const pkg = opportunity.packageId
    ? await prisma.sponsorshipPackage.findFirst({
        where: { id: opportunity.packageId, companyId },
        select: {
          id: true,
          name: true,
          maxSlots: true,
          benefits: true,
          _count: { select: { contracts: { where: { status: { in: [...SLOT_TAKING_STATUSES] } } } } },
        },
      })
    : null;
  if (pkg?.maxSlots != null && pkg._count.contracts >= pkg.maxSlots) {
    throw new Error(`El plan "${pkg.name}" ya vendió sus ${pkg.maxSlots} cupos. Aumenta los cupos del plan o elige otro nivel.`);
  }

  const projectId = opportunity.projectId;
  const benefits = input.createDeliverables && pkg ? pkg.benefits.map((b) => b.trim()).filter(Boolean) : [];

  return prisma.$transaction(async (tx) => {
    if (pkg?.maxSlots != null) {
      // Re-chequeo bajo lock del plan: el conteo de arriba es solo para fallar
      // rápido. Sin esto, dos conversiones simultáneas veían ambas un cupo
      // libre y vendían dos contratos de un plan con un único cupo.
      await tx.$queryRaw`SELECT id FROM "SponsorshipPackage" WHERE id = ${pkg.id} AND "companyId" = ${companyId} FOR UPDATE`;
      const taken = await tx.sponsorshipContract.count({ where: { companyId, packageId: pkg.id, status: { in: [...SLOT_TAKING_STATUSES] } } });
      if (taken >= pkg.maxSlots) {
        throw new Error(`El plan "${pkg.name}" ya vendió sus ${pkg.maxSlots} cupos. Aumenta los cupos del plan o elige otro nivel.`);
      }
    }
    const contract = await tx.sponsorshipContract.create({
      data: {
        companyId,
        projectId,
        contactId,
        tier: input.tier,
        isBarter: input.isBarter,
        cashAmount: input.cashAmount,
        barterValuation: input.isBarter ? input.barterValuation : 0,
        barterDescription: input.isBarter ? (input.barterDescription ?? null) : null,
        status: 'CONFIRMED',
        packageId: pkg?.id ?? null,
        notes: `Creado desde el CRM: ${opportunity.title}`,
      },
    });
    if (benefits.length > 0) {
      await tx.sponsorshipDeliverable.createMany({
        data: benefits.map((title) => ({ companyId, contractId: contract.id, title: title.slice(0, 200), type: 'OTRO' as const })),
      });
    }
    const linked = await tx.opportunity.updateMany({
      where: { id: opportunityId, companyId, sponsorshipContractId: null },
      data: { sponsorshipContractId: contract.id, contactId, prospectName: null },
    });
    if (linked.count === 0) throw new AlreadyConvertedError('Este negocio ya se convirtió en contrato de auspicio');
    const updated = await tx.opportunity.findFirstOrThrow({ where: { id: opportunityId, companyId } });
    return { contract, opportunity: updated };
  }, LOCKING_TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// Actividades y agenda comercial
// ---------------------------------------------------------------------------

export async function addActivity(companyId: string, userId: string, input: ActivityCreateInput): Promise<CrmActivity> {
  await findOwned(companyId, input.opportunityId);
  return prisma.crmActivity.create({
    data: {
      companyId,
      opportunityId: input.opportunityId,
      type: input.type,
      summary: input.summary,
      dueAt: input.dueAt ?? null,
      completedAt: input.completed ? new Date() : null,
      userId,
    },
  });
}

export async function setActivityCompleted(companyId: string, activityId: string, completed: boolean): Promise<void> {
  const result = await prisma.crmActivity.updateMany({
    where: { id: activityId, companyId },
    data: { completedAt: completed ? new Date() : null },
  });
  if (result.count === 0) throw new Error('La actividad no existe o fue eliminada');
}

export async function rescheduleActivity(companyId: string, activityId: string, dueAt: Date | null): Promise<void> {
  const result = await prisma.crmActivity.updateMany({ where: { id: activityId, companyId }, data: { dueAt } });
  if (result.count === 0) throw new Error('La actividad no existe o fue eliminada');
}

export async function deleteActivity(companyId: string, activityId: string): Promise<void> {
  const result = await prisma.crmActivity.deleteMany({ where: { id: activityId, companyId } });
  if (result.count === 0) throw new Error('La actividad no existe o fue eliminada');
}

const taskInclude = {
  user: { select: { name: true } },
  opportunity: {
    select: {
      id: true,
      title: true,
      stage: true,
      dealType: true,
      prospectName: true,
      contact: { select: { razonSocial: true } },
      owner: { select: { id: true, name: true } },
      project: { select: { code: true } },
    },
  },
} satisfies Prisma.CrmActivityInclude;

export type CrmTask = Prisma.CrmActivityGetPayload<{ include: typeof taskInclude }>;

/**
 * Agenda comercial: todo lo pendiente (con o sin fecha) más lo completado en
 * la última semana, para que marcar algo como hecho no lo haga desaparecer
 * de golpe de la pantalla.
 */
export async function listTasks(companyId: string, filters: { ownerUserId?: string } = {}): Promise<CrmTask[]> {
  const since = new Date(Date.now() - 7 * DAY_MS);
  return prisma.crmActivity.findMany({
    where: {
      companyId,
      ...(filters.ownerUserId ? { opportunity: { ownerUserId: filters.ownerUserId } } : {}),
      OR: [{ completedAt: null }, { completedAt: { gte: since } }],
    },
    include: taskInclude,
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 500,
  });
}

// ---------------------------------------------------------------------------
// Personas de contacto
// ---------------------------------------------------------------------------

const personInclude = {
  contact: { select: { id: true, razonSocial: true, rut: true } },
  _count: { select: { opportunities: true } },
} satisfies Prisma.CrmPersonInclude;

export type CrmPersonRow = Prisma.CrmPersonGetPayload<{ include: typeof personInclude }>;

export async function listPeople(companyId: string, search?: string): Promise<CrmPersonRow[]> {
  const q = search?.trim();
  return prisma.crmPerson.findMany({
    where: {
      companyId,
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { organizationName: { contains: q, mode: 'insensitive' } },
              { jobTitle: { contains: q, mode: 'insensitive' } },
              { contact: { razonSocial: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: personInclude,
    orderBy: { fullName: 'asc' },
    take: 500,
  });
}

export interface PersonOption {
  id: string;
  fullName: string;
  jobTitle: string | null;
  organization: string | null;
}

export async function searchPeople(companyId: string, query: string): Promise<PersonOption[]> {
  const rows = await listPeople(companyId, query);
  return rows.slice(0, 10).map((p) => ({ id: p.id, fullName: p.fullName, jobTitle: p.jobTitle, organization: p.contact?.razonSocial ?? p.organizationName }));
}

export type CrmPersonDetail = CrmPerson & {
  contact: { id: string; razonSocial: string; rut: string } | null;
  opportunities: Array<{ id: string; title: string; stage: OpportunityStage; amount: number; dealType: DealTypeKey; updatedAt: Date }>;
};

export async function getPerson(companyId: string, id: string): Promise<CrmPersonDetail | null> {
  return prisma.crmPerson.findFirst({
    where: { id, companyId },
    include: {
      contact: { select: { id: true, razonSocial: true, rut: true } },
      opportunities: {
        where: { companyId },
        select: { id: true, title: true, stage: true, amount: true, dealType: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      },
    },
  });
}

function personData(input: PersonCreateInput) {
  return {
    fullName: input.fullName,
    jobTitle: input.jobTitle ?? null,
    contactId: input.contactId ?? null,
    organizationName: input.contactId ? null : (input.organizationName ?? null),
    email: input.email ?? null,
    phone: input.phone ?? null,
    instagram: input.instagram?.replace(/^@/, '') ?? null,
    linkedinUrl: input.linkedinUrl ?? null,
    isDecisionMaker: input.isDecisionMaker,
    tags: normalizeTags(input.tags ?? []),
    notes: input.notes ?? null,
  };
}

export async function createPerson(companyId: string, input: PersonCreateInput): Promise<CrmPerson> {
  await assertContact(companyId, input.contactId);
  return prisma.crmPerson.create({ data: { companyId, ...personData(input) } });
}

export async function updatePerson(companyId: string, id: string, input: PersonUpdateInput): Promise<CrmPerson> {
  await assertContact(companyId, input.contactId);
  const result = await prisma.crmPerson.updateMany({ where: { id, companyId }, data: personData(input) });
  if (result.count === 0) throw new Error('La persona no existe o fue eliminada');
  const updated = await prisma.crmPerson.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('La persona no existe o fue eliminada');
  return updated;
}

/** Borrar una persona no borra sus negocios: quedan sin persona de contacto (`SetNull`). */
export async function deletePerson(companyId: string, id: string): Promise<void> {
  const result = await prisma.crmPerson.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('La persona no existe o fue eliminada');
}

// ---------------------------------------------------------------------------
// Resumen del embudo y reportes
// ---------------------------------------------------------------------------

export interface PipelineSummary {
  openCount: number;
  openAmount: number;
  weightedForecast: number;
  openBarter: number;
  wonThisMonthCount: number;
  wonThisMonthAmount: number;
  winRatePct: number | null;
  medianCycleDays: number | null;
  overdueActivities: number;
  staleCount: number;
  byStage: Array<{ stage: OpportunityStage; count: number; amount: number; weighted: number }>;
  lostReasons: Array<{ reason: string; count: number }>;
}

export async function getPipelineSummary(companyId: string, filters: PipelineFilters & { ownerUserId?: string } = {}): Promise<PipelineSummary> {
  const now = new Date();
  const since = new Date(now.getTime() - 180 * DAY_MS);
  const monthStart = startOfMonthSantiago(now);
  const base = filtersWhere(companyId, filters);

  const [open, closed, overdueActivities] = await Promise.all([
    prisma.opportunity.findMany({
      where: { ...base, stage: { in: OPEN_STAGES } },
      select: { stage: true, amount: true, probability: true, stageChangedAt: true, barterValuation: true },
    }),
    prisma.opportunity.findMany({
      where: { ...base, stage: { in: ['WON', 'LOST'] }, closedAt: { gte: since } },
      select: { stage: true, amount: true, createdAt: true, closedAt: true, lostReason: true },
    }),
    prisma.crmActivity.count({
      where: { companyId, completedAt: null, dueAt: { lt: now }, opportunity: base },
    }),
  ]);

  const byStage = OPEN_STAGES.map((stage) => {
    const items = open.filter((o) => o.stage === stage);
    return {
      stage: stage as OpportunityStage,
      count: items.length,
      amount: items.reduce((s, o) => s + o.amount, 0),
      weighted: Math.round(items.reduce((s, o) => s + (o.amount * o.probability) / 100, 0)),
    };
  });
  const won = closed.filter((o) => o.stage === 'WON');
  const lost = closed.filter((o) => o.stage === 'LOST');
  const wonThisMonth = won.filter((o) => o.closedAt && o.closedAt >= monthStart);
  const reasonCounts = new Map<string, number>();
  for (const opp of lost) {
    const reason = opp.lostReason?.trim() || 'Sin motivo';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const staleLimit = now.getTime() - STALE_AFTER_DAYS * DAY_MS;

  return {
    openCount: open.length,
    openAmount: open.reduce((s, o) => s + o.amount, 0),
    weightedForecast: byStage.reduce((s, st) => s + st.weighted, 0),
    openBarter: open.reduce((s, o) => s + o.barterValuation, 0),
    wonThisMonthCount: wonThisMonth.length,
    wonThisMonthAmount: wonThisMonth.reduce((s, o) => s + o.amount, 0),
    winRatePct: won.length + lost.length === 0 ? null : (won.length / (won.length + lost.length)) * 100,
    medianCycleDays: median(won.filter((o) => o.closedAt).map((o) => ((o.closedAt as Date).getTime() - o.createdAt.getTime()) / DAY_MS)),
    overdueActivities,
    staleCount: open.filter((o) => o.stageChangedAt.getTime() < staleLimit).length,
    byStage,
    lostReasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

export interface CrmReport {
  forecast: ForecastBucket[];
  byDealType: BreakdownRow[];
  bySource: BreakdownRow[];
  byOwner: BreakdownRow[];
  byProject: BreakdownRow[];
  lostReasons: Array<{ reason: string; count: number }>;
  totals: { openAmount: number; weighted: number; wonAmount: number; wonBarter: number; winRatePct: number | null; closedCount: number };
}

/**
 * Reporte comercial de los últimos 12 meses: todo lo abierto más lo cerrado
 * en la ventana. Los desgloses reutilizan las funciones puras de
 * `src/lib/crm/analytics.ts` (mismas cifras que verifican los tests).
 */
export async function getCrmReport(companyId: string, filters: { ownerUserId?: string } = {}): Promise<CrmReport> {
  const now = new Date();
  const since = new Date(now.getTime() - 365 * DAY_MS);
  const rows = await prisma.opportunity.findMany({
    where: {
      companyId,
      ...(filters.ownerUserId ? { ownerUserId: filters.ownerUserId } : {}),
      OR: [{ stage: { in: OPEN_STAGES } }, { closedAt: { gte: since } }],
    },
    select: {
      stage: true,
      amount: true,
      barterValuation: true,
      probability: true,
      expectedCloseDate: true,
      createdAt: true,
      closedAt: true,
      dealType: true,
      source: true,
      lostReason: true,
      owner: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    take: 5000,
  });

  const reasonCounts = new Map<string, number>();
  for (const opp of rows) {
    if (opp.stage !== 'LOST') continue;
    const reason = opp.lostReason?.trim() || 'Sin motivo';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const byDealType = breakdownBy(rows, (o) => ({ key: o.dealType, label: DEAL_TYPE_LABELS[o.dealType] }));
  const won = rows.filter((o) => o.stage === 'WON');
  const lost = rows.filter((o) => o.stage === 'LOST');

  return {
    forecast: forecastByMonth(rows, now, 6),
    byDealType,
    bySource: breakdownBy(rows, (o) => ({ key: o.source ?? '—', label: o.source ?? 'Sin origen' })),
    byOwner: breakdownBy(rows, (o) => ({ key: o.owner?.id ?? '—', label: o.owner?.name ?? 'Sin responsable' })),
    byProject: breakdownBy(rows, (o) => ({ key: o.project?.id ?? '—', label: o.project?.name ?? 'Sin certamen' })),
    lostReasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    totals: {
      openAmount: byDealType.reduce((s, r) => s + r.openAmount, 0),
      weighted: byDealType.reduce((s, r) => s + r.weighted, 0),
      wonAmount: won.reduce((s, o) => s + o.amount, 0),
      wonBarter: won.reduce((s, o) => s + o.barterValuation, 0),
      winRatePct: won.length + lost.length === 0 ? null : (won.length / (won.length + lost.length)) * 100,
      closedCount: won.length + lost.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Opciones para formularios
// ---------------------------------------------------------------------------

/** Personas que pueden ser responsables de una oportunidad (usuarios activos de la empresa). */
export async function listAssignableUsers(companyId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.user.findMany({
    where: { isActive: true, OR: [{ companyId }, { companyMemberships: { some: { companyId } } }] },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export interface CrmProjectOption {
  id: string;
  name: string;
  code: string;
  status: string;
}

export async function listProjectOptions(companyId: string): Promise<CrmProjectOption[]> {
  return prisma.project.findMany({
    where: { companyId, status: { not: 'CANCELLED' } },
    select: { id: true, name: true, code: true, status: true },
    orderBy: { startDate: 'desc' },
    take: 200,
  });
}

export interface CrmPackageOption {
  id: string;
  projectId: string;
  name: string;
  tier: SponsorshipTier;
  tierLabel: string;
  price: number;
  maxSlots: number | null;
  soldSlots: number;
}

export async function listPackageOptions(companyId: string): Promise<CrmPackageOption[]> {
  const packages = await prisma.sponsorshipPackage.findMany({
    where: { companyId },
    select: {
      id: true,
      projectId: true,
      name: true,
      tier: true,
      price: true,
      maxSlots: true,
      _count: { select: { contracts: { where: { status: { in: [...SLOT_TAKING_STATUSES] } } } } },
    },
    orderBy: [{ projectId: 'asc' }, { order: 'asc' }, { price: 'desc' }],
    take: 500,
  });
  return packages.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    name: p.name,
    tier: p.tier,
    tierLabel: SPONSORSHIP_TIER_LABELS[p.tier],
    price: p.price,
    maxSlots: p.maxSlots,
    soldSlots: p._count.contracts,
  }));
}

/** Etiquetas en uso (para el filtro del tablero y las sugerencias del formulario). */
export async function listTagsInUse(companyId: string): Promise<string[]> {
  const rows = await prisma.opportunity.findMany({ where: { companyId, NOT: { tags: { isEmpty: true } } }, select: { tags: true }, take: 2000 });
  return normalizeTags(rows.flatMap((r) => r.tags)).sort((a, b) => a.localeCompare(b, 'es-CL'));
}

// ---------------------------------------------------------------------------
// Prospectos entrantes desde el micrositio público
// ---------------------------------------------------------------------------

export interface InboundLeadResult {
  opportunityId: string;
  title: string;
  /** `true` si la misma persona ya había escrito por este certamen hace poco y solo se sumó la nota. */
  deduplicated: boolean;
}

/**
 * Registra un "Quiero auspiciar" del micrositio: persona de contacto +
 * oportunidad de tipo Auspicio en etapa Prospecto + tarea "responder" para
 * mañana. Si el mismo correo ya escribió por el mismo certamen en las
 * últimas 24 horas, se agrega una nota a esa oportunidad en vez de abrir otra
 * (un reenvío del formulario no debe duplicar el embudo).
 *
 * `companyId`/`projectId` los resuelve el llamador desde el slug público,
 * nunca desde el formulario.
 */
export async function createInboundSponsorLead(
  companyId: string,
  project: { id: string; name: string },
  input: PublicSponsorLeadInput
): Promise<InboundLeadResult> {
  const email = input.email.toLowerCase();
  const pkg = input.packageId
    ? await prisma.sponsorshipPackage.findFirst({
        where: { id: input.packageId, companyId, projectId: project.id, isPublic: true },
        select: { id: true, name: true, tier: true, price: true },
      })
    : null;
  const noteLines = [
    `Solicitud recibida desde el sitio público del certamen.`,
    `Contacto: ${input.contactName}${input.jobTitle ? ` (${input.jobTitle})` : ''} · ${email}${input.phone ? ` · ${input.phone}` : ''}`,
    pkg ? `Plan de interés: ${pkg.name}` : null,
    input.message ? `Mensaje: ${input.message}` : null,
  ].filter((line): line is string => line !== null);
  const summary = noteLines.join('\n');

  const recent = await prisma.opportunity.findFirst({
    where: { companyId, projectId: project.id, prospectEmail: email, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    select: { id: true, title: true },
  });
  if (recent) {
    await prisma.crmActivity.create({
      data: { companyId, opportunityId: recent.id, type: 'NOTE', summary: summary.slice(0, 1000), completedAt: new Date() },
    });
    return { opportunityId: recent.id, title: recent.title, deduplicated: true };
  }

  const title = `Auspicio ${project.name} — ${input.companyName}`.slice(0, 160);
  const opportunity = await prisma.$transaction(async (tx) => {
    const person = await tx.crmPerson.create({
      data: {
        companyId,
        fullName: input.contactName,
        jobTitle: input.jobTitle ?? null,
        organizationName: input.companyName,
        email,
        phone: input.phone ?? null,
        tags: ['Web'],
      },
    });
    const created = await tx.opportunity.create({
      data: {
        companyId,
        title,
        prospectName: input.companyName,
        prospectEmail: email,
        prospectPhone: input.phone ?? null,
        amount: pkg?.price ?? 0,
        probability: STAGE_DEFAULT_PROBABILITY.LEAD,
        stage: 'LEAD',
        source: WEB_LEAD_SOURCE,
        notes: summary.slice(0, 4000),
        dealType: 'SPONSORSHIP',
        priority: 'MEDIUM',
        projectId: project.id,
        packageId: pkg?.id ?? null,
        sponsorshipTier: pkg?.tier ?? null,
        tags: ['Web'],
        personId: person.id,
      },
    });
    await tx.crmActivity.create({
      data: {
        companyId,
        opportunityId: created.id,
        type: 'EMAIL',
        summary: `Responder solicitud de auspicio de ${input.companyName}`,
        dueAt: startOfTomorrowSantiago(),
      },
    });
    return created;
  });

  return { opportunityId: opportunity.id, title: opportunity.title, deduplicated: false };
}

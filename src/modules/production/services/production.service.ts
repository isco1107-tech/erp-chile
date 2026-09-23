import { prisma } from '@/lib/prisma';
import type { AccreditationLevel, BadgeTemplate, CandidateStatus, StaffAccreditation, StageTimelineItem, WardrobeItem } from '@prisma/client';
import { chainStartTimes } from '@/lib/events/run-of-show';
import { STAGE_SEGMENT_META } from '../schema';
import type {
  BadgeTemplateCreateInput,
  BadgeTemplateUpdateInput,
  StaffAccreditationCreateInput,
  StageLiveAction,
  StageTimelineItemCreateInput,
  StageTimelineItemUpdateInput,
  WardrobeItemCreateInput,
  WardrobeItemUpdateInput,
} from '../schema';

async function assertProjectOwnership(companyId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!project) throw new Error('El proyecto/certamen no existe o no pertenece a esta empresa');
}

async function assertBadgeTemplateOwnership(companyId: string, projectId: string, templateId: string): Promise<void> {
  const template = await prisma.badgeTemplate.findFirst({ where: { id: templateId, companyId, projectId }, select: { id: true } });
  if (!template) throw new Error('La plantilla de diseño no existe o no pertenece a este proyecto');
}

/**
 * La candidata de un bloque o de una prenda tiene que ser del MISMO
 * certamen y de la misma empresa. Sin esto, un id adivinado de otra empresa
 * quedaba colgado del bloque y su nombre aparecía en la escaleta ajena.
 */
async function assertCandidateInProject(companyId: string, projectId: string, candidateId: string | null | undefined): Promise<void> {
  if (!candidateId) return;
  const found = await prisma.candidate.findFirst({ where: { id: candidateId, companyId, projectId }, select: { id: true } });
  if (!found) throw new Error('La candidata no existe o no pertenece a este certamen');
}

async function assertStageItemInProject(companyId: string, projectId: string, stageItemId: string | null | undefined): Promise<void> {
  if (!stageItemId) return;
  const found = await prisma.stageTimelineItem.findFirst({ where: { id: stageItemId, companyId, projectId }, select: { id: true } });
  if (!found) throw new Error('El bloque de escaleta no existe o no pertenece a este certamen');
}

// ---------------------------------------------------------------------------
// Escaleta (StageTimelineItem)
// ---------------------------------------------------------------------------

export async function createStageItem(companyId: string, data: StageTimelineItemCreateInput): Promise<StageTimelineItem> {
  await assertProjectOwnership(companyId, data.projectId);
  await assertCandidateInProject(companyId, data.projectId, data.candidateId);

  const last = await prisma.stageTimelineItem.findFirst({
    where: { companyId, projectId: data.projectId },
    orderBy: { blockOrder: 'desc' },
    select: { blockOrder: true },
  });

  return prisma.stageTimelineItem.create({
    data: {
      companyId,
      projectId: data.projectId,
      blockOrder: (last?.blockOrder ?? 0) + 1,
      startTime: data.startTime,
      durationMinutes: data.durationMinutes,
      title: data.title,
      description: data.description || undefined,
      candidateId: data.candidateId || undefined,
      segmentType: data.segmentType,
      responsible: data.responsible || undefined,
      audioCue: data.audioCue || undefined,
      lightingCue: data.lightingCue || undefined,
      videoCue: data.videoCue || undefined,
    },
  });
}

const blank = (value: string | undefined) => (value === '' ? null : value);

export async function updateStageItem(companyId: string, id: string, data: StageTimelineItemUpdateInput): Promise<StageTimelineItem> {
  const existing = await prisma.stageTimelineItem.findFirst({ where: { id, companyId }, select: { projectId: true } });
  if (!existing) throw new Error('Bloque de escaleta no encontrado');
  await assertCandidateInProject(companyId, existing.projectId, data.candidateId);

  await prisma.stageTimelineItem.updateMany({
    where: { id, companyId },
    data: {
      startTime: data.startTime,
      durationMinutes: data.durationMinutes,
      title: data.title,
      description: blank(data.description),
      candidateId: blank(data.candidateId),
      status: data.status,
      segmentType: data.segmentType,
      responsible: blank(data.responsible),
      audioCue: blank(data.audioCue),
      lightingCue: blank(data.lightingCue),
      videoCue: blank(data.videoCue),
    },
  });

  const updated = await prisma.stageTimelineItem.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Bloque de escaleta no encontrado');
  return updated;
}

/**
 * Sube/baja un bloque en la escaleta intercambiando `blockOrder` con su
 * vecino. El intercambio directo (A toma el orden de B, B toma el de A) en
 * dos `UPDATE` separados chocaría contra `@@unique([projectId, blockOrder])`
 * — Postgres valida uniqueness al final de cada sentencia, no al final de la
 * transacción, así que el segundo `UPDATE` vería todavía el valor viejo del
 * primero. Se resuelve pasando por un valor centinela (`-1`, fuera del rango
 * real de bloques) que ningún bloque real usa nunca.
 */
export async function moveStageItem(companyId: string, projectId: string, id: string, direction: 'up' | 'down'): Promise<void> {
  const items = await prisma.stageTimelineItem.findMany({
    where: { companyId, projectId },
    orderBy: { blockOrder: 'asc' },
    select: { id: true, blockOrder: true },
  });
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw new Error('Bloque de escaleta no encontrado');

  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= items.length) return;

  const current = items[index]!;
  const neighbor = items[neighborIndex]!;

  await prisma.$transaction([
    prisma.stageTimelineItem.updateMany({ where: { id: current.id, companyId }, data: { blockOrder: -1 } }),
    prisma.stageTimelineItem.updateMany({ where: { id: neighbor.id, companyId }, data: { blockOrder: current.blockOrder } }),
    prisma.stageTimelineItem.updateMany({ where: { id: current.id, companyId }, data: { blockOrder: neighbor.blockOrder } }),
  ]);
}

/** Copia un bloque al final de la escaleta (los tiempos reales y el estado no se copian). */
export async function duplicateStageItem(companyId: string, id: string): Promise<StageTimelineItem> {
  const source = await prisma.stageTimelineItem.findFirst({ where: { id, companyId } });
  if (!source) throw new Error('Bloque de escaleta no encontrado');
  const last = await prisma.stageTimelineItem.findFirst({
    where: { companyId, projectId: source.projectId },
    orderBy: { blockOrder: 'desc' },
    select: { blockOrder: true, startTime: true, durationMinutes: true },
  });
  const startTime = last ? new Date(last.startTime.getTime() + last.durationMinutes * 60_000) : source.startTime;
  return prisma.stageTimelineItem.create({
    data: {
      companyId,
      projectId: source.projectId,
      blockOrder: (last?.blockOrder ?? 0) + 1,
      startTime,
      durationMinutes: source.durationMinutes,
      title: `${source.title} (copia)`.slice(0, 160),
      description: source.description,
      candidateId: source.candidateId,
      segmentType: source.segmentType,
      responsible: source.responsible,
      audioCue: source.audioCue,
      lightingCue: source.lightingCue,
      videoCue: source.videoCue,
    },
  });
}

export async function deleteStageItem(companyId: string, id: string): Promise<void> {
  const result = await prisma.stageTimelineItem.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Bloque de escaleta no encontrado');
}

/**
 * Controles del modo show. Poner un bloque "al aire" cierra el que estaba al
 * aire (solo puede haber uno), todo en una transacción para que dos
 * pantallas de control no dejen dos bloques en curso a la vez.
 */
export async function applyStageLiveAction(companyId: string, id: string, action: StageLiveAction): Promise<void> {
  const item = await prisma.stageTimelineItem.findFirst({ where: { id, companyId } });
  if (!item) throw new Error('Bloque de escaleta no encontrado');
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (action === 'start') {
      await tx.stageTimelineItem.updateMany({
        where: { companyId, projectId: item.projectId, status: 'IN_PROGRESS', NOT: { id } },
        data: { status: 'DONE', actualEndedAt: now },
      });
      await tx.stageTimelineItem.updateMany({ where: { id, companyId }, data: { status: 'IN_PROGRESS', actualStartedAt: now, actualEndedAt: null } });
    } else if (action === 'finish') {
      await tx.stageTimelineItem.updateMany({
        where: { id, companyId },
        data: { status: 'DONE', actualStartedAt: item.actualStartedAt ?? now, actualEndedAt: now },
      });
    } else if (action === 'skip') {
      await tx.stageTimelineItem.updateMany({ where: { id, companyId }, data: { status: 'SKIPPED', actualStartedAt: null, actualEndedAt: null } });
    } else {
      await tx.stageTimelineItem.updateMany({ where: { id, companyId }, data: { status: 'PENDING', actualStartedAt: null, actualEndedAt: null } });
    }
  });
}

/**
 * "Siguiente bloque": cierra el que está al aire y pone al aire el primer
 * pendiente que viene después. Es el botón que se aprieta en vivo.
 * Devuelve el id del bloque que quedó al aire, o `null` si el show terminó.
 */
export async function advanceShow(companyId: string, projectId: string): Promise<string | null> {
  await assertProjectOwnership(companyId, projectId);
  const items = await prisma.stageTimelineItem.findMany({
    where: { companyId, projectId },
    orderBy: { blockOrder: 'asc' },
    select: { id: true, status: true, actualStartedAt: true },
  });
  const currentIndex = items.findIndex((i) => i.status === 'IN_PROGRESS');
  const next = items.find((i, index) => i.status === 'PENDING' && index > currentIndex);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (currentIndex !== -1) {
      const current = items[currentIndex]!;
      await tx.stageTimelineItem.updateMany({
        where: { id: current.id, companyId, status: 'IN_PROGRESS' },
        data: { status: 'DONE', actualStartedAt: current.actualStartedAt ?? now, actualEndedAt: now },
      });
    }
    if (next) {
      await tx.stageTimelineItem.updateMany({ where: { id: next.id, companyId }, data: { status: 'IN_PROGRESS', actualStartedAt: now, actualEndedAt: null } });
    }
  });

  return next?.id ?? null;
}

/** Reprograma las horas de inicio en cadena (cada bloque parte cuando termina el anterior). */
export async function chainStageSchedule(companyId: string, projectId: string, firstStart: Date): Promise<number> {
  await assertProjectOwnership(companyId, projectId);
  const items = await prisma.stageTimelineItem.findMany({
    where: { companyId, projectId },
    orderBy: { blockOrder: 'asc' },
    select: { id: true, startTime: true, durationMinutes: true },
  });
  const changes = chainStartTimes(items, firstStart);
  if (changes.length === 0) return 0;
  await prisma.$transaction(changes.map((c) => prisma.stageTimelineItem.updateMany({ where: { id: c.id, companyId }, data: { startTime: c.startTime } })));
  return changes.length;
}

export type StageTimelineItemWithCandidate = StageTimelineItem & {
  candidate: { id: string; fullName: string; stageName: string | null; candidateNumber: number | null; representing: string | null } | null;
  wardrobeItems: Array<{ id: string; name: string; status: WardrobeItem['status']; candidate: { fullName: string; stageName: string | null; candidateNumber: number | null } | null }>;
};

export async function listStageItems(companyId: string, projectId: string): Promise<StageTimelineItemWithCandidate[]> {
  return prisma.stageTimelineItem.findMany({
    where: { companyId, projectId },
    include: {
      candidate: { select: { id: true, fullName: true, stageName: true, candidateNumber: true, representing: true } },
      wardrobeItems: {
        where: { companyId },
        select: { id: true, name: true, status: true, candidate: { select: { fullName: true, stageName: true, candidateNumber: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { blockOrder: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Vestuario (WardrobeItem)
// ---------------------------------------------------------------------------

export async function createWardrobeItem(companyId: string, data: WardrobeItemCreateInput): Promise<WardrobeItem> {
  await assertProjectOwnership(companyId, data.projectId);
  await Promise.all([
    assertCandidateInProject(companyId, data.projectId, data.candidateId),
    assertStageItemInProject(companyId, data.projectId, data.stageTimelineItemId),
  ]);
  return prisma.wardrobeItem.create({
    data: {
      companyId,
      projectId: data.projectId,
      name: data.name,
      designer: data.designer || undefined,
      stageTimelineItemId: data.stageTimelineItemId || undefined,
      candidateId: data.candidateId || undefined,
      status: data.status,
      notes: data.notes || undefined,
      source: data.source,
      size: data.size || undefined,
      color: data.color || undefined,
      valuation: data.valuation ?? undefined,
      fittingAt: data.fittingAt ?? undefined,
      returnDueAt: data.returnDueAt ?? undefined,
    },
  });
}

export async function updateWardrobeItem(companyId: string, id: string, data: WardrobeItemUpdateInput): Promise<WardrobeItem> {
  const existing = await prisma.wardrobeItem.findFirst({ where: { id, companyId }, select: { projectId: true } });
  if (!existing) throw new Error('Prenda no encontrada');
  await Promise.all([
    assertCandidateInProject(companyId, existing.projectId, data.candidateId),
    assertStageItemInProject(companyId, existing.projectId, data.stageTimelineItemId),
  ]);

  await prisma.wardrobeItem.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      designer: blank(data.designer),
      stageTimelineItemId: blank(data.stageTimelineItemId),
      candidateId: blank(data.candidateId),
      status: data.status,
      notes: blank(data.notes),
      source: data.source,
      size: blank(data.size),
      color: blank(data.color),
      valuation: data.valuation,
      fittingAt: data.fittingAt,
      returnDueAt: data.returnDueAt,
    },
  });

  const updated = await prisma.wardrobeItem.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Prenda no encontrada');
  return updated;
}

export async function deleteWardrobeItem(companyId: string, id: string): Promise<void> {
  const result = await prisma.wardrobeItem.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Prenda no encontrada');
}

export type WardrobeItemWithRelations = WardrobeItem & {
  candidate: { id: string; fullName: string; stageName: string | null; candidateNumber: number | null } | null;
  stageTimelineItem: { id: string; title: string; blockOrder: number; segmentType: StageTimelineItem['segmentType'] } | null;
};

export async function listWardrobeItems(companyId: string, projectId: string): Promise<WardrobeItemWithRelations[]> {
  return prisma.wardrobeItem.findMany({
    where: { companyId, projectId },
    include: {
      candidate: { select: { id: true, fullName: true, stageName: true, candidateNumber: true } },
      stageTimelineItem: { select: { id: true, title: true, blockOrder: true, segmentType: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** Candidatas que pasan a la gala: las que tienen algo que vestir. */
const COMPETING_STATUSES: CandidateStatus[] = ['OFFICIAL_CANDIDATE', 'FINALIST', 'WINNER'];

/**
 * "Plan de looks": una prenda pendiente por candidata oficial en cada bloque
 * de la escaleta que pide vestuario propio (traje de baño, gala, típico,
 * opening). Idempotente: si la candidata ya tiene una prenda en ese bloque,
 * no se crea otra — se puede volver a correr después de sumar bloques.
 */
export async function generateWardrobePlan(companyId: string, projectId: string): Promise<number> {
  await assertProjectOwnership(companyId, projectId);
  const [blocks, candidates, existing] = await Promise.all([
    prisma.stageTimelineItem.findMany({ where: { companyId, projectId }, select: { id: true, title: true, segmentType: true }, orderBy: { blockOrder: 'asc' } }),
    prisma.candidate.findMany({
      where: { companyId, projectId, status: { in: COMPETING_STATUSES } },
      select: { id: true, fullName: true, stageName: true },
    }),
    prisma.wardrobeItem.findMany({ where: { companyId, projectId, candidateId: { not: null }, stageTimelineItemId: { not: null } }, select: { candidateId: true, stageTimelineItemId: true } }),
  ]);
  const taken = new Set(existing.map((w) => `${w.candidateId}:${w.stageTimelineItemId}`));
  const rows: Array<{ companyId: string; projectId: string; name: string; candidateId: string; stageTimelineItemId: string }> = [];
  for (const block of blocks) {
    if (!STAGE_SEGMENT_META[block.segmentType].suggestsWardrobe) continue;
    for (const candidate of candidates) {
      if (taken.has(`${candidate.id}:${block.id}`)) continue;
      rows.push({
        companyId,
        projectId,
        name: `${STAGE_SEGMENT_META[block.segmentType].label} — ${candidate.stageName ?? candidate.fullName}`.slice(0, 160),
        candidateId: candidate.id,
        stageTimelineItemId: block.id,
      });
    }
  }
  if (rows.length === 0) return 0;
  const result = await prisma.wardrobeItem.createMany({ data: rows });
  return result.count;
}

// ---------------------------------------------------------------------------
// Acreditación de staff/proveedores
// ---------------------------------------------------------------------------

export async function createStaffAccreditation(companyId: string, data: StaffAccreditationCreateInput): Promise<StaffAccreditation> {
  await assertProjectOwnership(companyId, data.projectId);
  if (data.templateId) await assertBadgeTemplateOwnership(companyId, data.projectId, data.templateId);
  const templateId = data.templateId || (await getDefaultBadgeTemplateId(companyId, data.projectId));
  return prisma.staffAccreditation.create({
    data: {
      companyId,
      projectId: data.projectId,
      fullName: data.fullName,
      role: data.role,
      organization: data.organization || undefined,
      email: data.email || undefined,
      accessLevel: data.accessLevel,
      badgeCode: data.badgeCode,
      templateId: templateId || undefined,
    },
  });
}

export async function markAccreditationQrEmailSent(companyId: string, id: string): Promise<void> {
  await prisma.staffAccreditation.updateMany({ where: { id, companyId }, data: { qrEmailSentAt: new Date() } });
}

export async function getStaffAccreditationById(
  companyId: string,
  id: string
): Promise<StaffAccreditation & { project: { name: string }; template: BadgeTemplate | null }> {
  const record = await prisma.staffAccreditation.findFirst({
    where: { id, companyId },
    include: { project: { select: { name: true } }, template: true },
  });
  if (!record) throw new Error('Acreditación no encontrada');
  return record;
}

export interface AccreditationVerificationData {
  fullName: string;
  role: string;
  organization: string | null;
  accessLevel: AccreditationLevel;
  badgeCode: string;
  checkedInAt: Date | null;
  companyName: string;
  projectName: string;
  template: BadgeTemplate | null;
}

/**
 * Búsqueda pública (sin sesión ni companyId) usada por la página de
 * verificación del QR: quien acredita el ingreso escanea el código y ve los
 * datos reales leídos en vivo desde la base, no lo que venga codificado en el
 * propio QR — así una credencial falsificada o alterada nunca pasa por real.
 */
export async function getAccreditationByQrToken(qrToken: string): Promise<AccreditationVerificationData | null> {
  const record = await prisma.staffAccreditation.findUnique({
    where: { qrToken },
    include: { company: { select: { businessName: true } }, project: { select: { name: true } }, template: true },
  });
  if (!record) return null;
  return {
    fullName: record.fullName,
    role: record.role,
    organization: record.organization,
    accessLevel: record.accessLevel,
    badgeCode: record.badgeCode,
    checkedInAt: record.checkedInAt,
    companyName: record.company.businessName,
    projectName: record.project.name,
    template: record.template,
  };
}

export interface QrCheckInResult {
  data: AccreditationVerificationData;
  companyId: string;
  accreditationId: string;
  /** true si este escaneo fue el que registró el ingreso (para auditar solo la primera vez, no cada refresh de la página). */
  justCheckedIn: boolean;
}

/**
 * Check-in disparado por el propio escaneo del QR (sin sesión ERP — quien
 * controla la puerta no necesariamente tiene cuenta). Idempotente igual que
 * `checkInStaff`: solo aplica el `UPDATE` si `checkedInAt` seguía en `null`,
 * así reabrir el link o escanear dos veces no pisa el timestamp del primer
 * ingreso real.
 */
export async function checkInByQrToken(qrToken: string): Promise<QrCheckInResult | null> {
  const existing = await prisma.staffAccreditation.findUnique({
    where: { qrToken },
    select: { id: true, companyId: true, checkedInAt: true },
  });
  if (!existing) return null;

  const justCheckedIn = existing.checkedInAt === null;
  if (justCheckedIn) {
    await prisma.staffAccreditation.updateMany({
      where: { id: existing.id, companyId: existing.companyId, checkedInAt: null },
      data: { checkedInAt: new Date() },
    });
  }

  const data = await getAccreditationByQrToken(qrToken);
  if (!data) return null;
  return { data, companyId: existing.companyId, accreditationId: existing.id, justCheckedIn };
}

/** Check-in idempotente: solo aplica si todavía no estaba marcado, así doble clic o dos puertas escaneando el mismo badge no pisan el timestamp real del primer ingreso. */
export async function checkInStaff(companyId: string, id: string): Promise<StaffAccreditation> {
  await prisma.staffAccreditation.updateMany({
    where: { id, companyId, checkedInAt: null },
    data: { checkedInAt: new Date() },
  });
  const updated = await prisma.staffAccreditation.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Acreditación no encontrada');
  return updated;
}

export async function deleteStaffAccreditation(companyId: string, id: string): Promise<void> {
  const result = await prisma.staffAccreditation.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Acreditación no encontrada');
}

export async function listStaffAccreditations(companyId: string, projectId: string): Promise<StaffAccreditation[]> {
  return prisma.staffAccreditation.findMany({
    where: { companyId, projectId },
    orderBy: { createdAt: 'desc' },
  });
}

export interface ProductionProjectOption {
  id: string;
  name: string;
  code: string;
}

export async function listProjectOptions(companyId: string): Promise<ProductionProjectOption[]> {
  return prisma.project.findMany({
    where: { companyId },
    select: { id: true, name: true, code: true },
    orderBy: { startDate: 'desc' },
  });
}

export interface ProductionCandidateOption {
  id: string;
  fullName: string;
  stageName: string | null;
  candidateNumber: number | null;
  representing: string | null;
  status: CandidateStatus;
}

/** Candidatas asignables a bloques y prendas: todas menos las descartadas o retiradas, numeradas primero. */
export async function listCandidateOptions(companyId: string, projectId: string): Promise<ProductionCandidateOption[]> {
  return prisma.candidate.findMany({
    where: { companyId, projectId, status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
    select: { id: true, fullName: true, stageName: true, candidateNumber: true, representing: true, status: true },
    orderBy: [{ candidateNumber: { sort: 'asc', nulls: 'last' } }, { fullName: 'asc' }],
  });
}

// ---------------------------------------------------------------------------
// Diseño de credencial (BadgeTemplate)
// ---------------------------------------------------------------------------

async function getDefaultBadgeTemplateId(companyId: string, projectId: string): Promise<string | null> {
  const template = await prisma.badgeTemplate.findFirst({
    where: { companyId, projectId, isDefault: true },
    select: { id: true },
  });
  return template?.id ?? null;
}

export async function listBadgeTemplates(companyId: string, projectId: string): Promise<BadgeTemplate[]> {
  return prisma.badgeTemplate.findMany({
    where: { companyId, projectId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getBadgeTemplateById(companyId: string, id: string): Promise<BadgeTemplate> {
  const template = await prisma.badgeTemplate.findFirst({ where: { id, companyId } });
  if (!template) throw new Error('Plantilla de diseño no encontrada');
  return template;
}

/**
 * `isDefault=true` único por proyecto se aplica acá (no se puede expresar como
 * índice único parcial en Prisma): dentro de la misma transacción, primero se
 * desmarca cualquier plantilla que ya fuera default del proyecto y luego se
 * crea/actualiza la nueva — así nunca queda más de una a la vez.
 */
export async function createBadgeTemplate(companyId: string, data: BadgeTemplateCreateInput): Promise<BadgeTemplate> {
  await assertProjectOwnership(companyId, data.projectId);
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.badgeTemplate.updateMany({ where: { companyId, projectId: data.projectId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.badgeTemplate.create({
      data: {
        companyId,
        projectId: data.projectId,
        name: data.name,
        backgroundMode: data.backgroundMode,
        backgroundColor: data.backgroundColor,
        backgroundImageUrl: data.backgroundMode === 'IMAGE' ? data.backgroundImageUrl : undefined,
        imageDisplayMode: data.imageDisplayMode,
        watermarkOpacityBps: data.watermarkOpacityBps,
        accentColor: data.accentColor,
        textColor: data.textColor,
        isDefault: data.isDefault,
      },
    });
  });
}

export async function updateBadgeTemplate(companyId: string, id: string, data: BadgeTemplateUpdateInput): Promise<BadgeTemplate> {
  const existing = await getBadgeTemplateById(companyId, id);
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.badgeTemplate.updateMany({
        where: { companyId, projectId: existing.projectId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const nextBackgroundMode = data.backgroundMode ?? existing.backgroundMode;
    const result = await tx.badgeTemplate.updateMany({
      where: { id, companyId },
      data: {
        name: data.name,
        backgroundMode: data.backgroundMode,
        backgroundColor: data.backgroundColor,
        backgroundImageUrl: nextBackgroundMode === 'IMAGE' ? (data.backgroundImageUrl || undefined) : data.backgroundImageUrl === '' ? null : data.backgroundImageUrl,
        imageDisplayMode: data.imageDisplayMode,
        watermarkOpacityBps: data.watermarkOpacityBps,
        accentColor: data.accentColor,
        textColor: data.textColor,
        isDefault: data.isDefault,
      },
    });
    if (result.count === 0) throw new Error('Plantilla de diseño no encontrada');
    const updated = await tx.badgeTemplate.findFirst({ where: { id, companyId } });
    if (!updated) throw new Error('Plantilla de diseño no encontrada');
    return updated;
  });
}

export async function deleteBadgeTemplate(companyId: string, id: string): Promise<void> {
  const result = await prisma.badgeTemplate.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Plantilla de diseño no encontrada');
}

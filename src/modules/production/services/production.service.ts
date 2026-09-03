import { prisma } from '@/lib/prisma';
import type { AccreditationLevel, BadgeTemplate, StaffAccreditation, StageTimelineItem, WardrobeItem } from '@prisma/client';
import type {
  BadgeTemplateCreateInput,
  BadgeTemplateUpdateInput,
  StaffAccreditationCreateInput,
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

// ---------------------------------------------------------------------------
// Escaleta (StageTimelineItem)
// ---------------------------------------------------------------------------

export async function createStageItem(companyId: string, data: StageTimelineItemCreateInput): Promise<StageTimelineItem> {
  await assertProjectOwnership(companyId, data.projectId);

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
    },
  });
}

export async function updateStageItem(companyId: string, id: string, data: StageTimelineItemUpdateInput): Promise<StageTimelineItem> {
  const result = await prisma.stageTimelineItem.updateMany({
    where: { id, companyId },
    data: {
      startTime: data.startTime,
      durationMinutes: data.durationMinutes,
      title: data.title,
      description: data.description === '' ? null : data.description,
      candidateId: data.candidateId === '' ? null : data.candidateId,
      status: data.status,
    },
  });
  if (result.count === 0) throw new Error('Bloque de escaleta no encontrado');

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

export async function deleteStageItem(companyId: string, id: string): Promise<void> {
  const result = await prisma.stageTimelineItem.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Bloque de escaleta no encontrado');
}

export type StageTimelineItemWithCandidate = StageTimelineItem & { candidate: { id: string; fullName: string; stageName: string | null } | null };

export async function listStageItems(companyId: string, projectId: string): Promise<StageTimelineItemWithCandidate[]> {
  return prisma.stageTimelineItem.findMany({
    where: { companyId, projectId },
    include: { candidate: { select: { id: true, fullName: true, stageName: true } } },
    orderBy: { blockOrder: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Vestuario (WardrobeItem)
// ---------------------------------------------------------------------------

export async function createWardrobeItem(companyId: string, data: WardrobeItemCreateInput): Promise<WardrobeItem> {
  await assertProjectOwnership(companyId, data.projectId);
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
    },
  });
}

export async function updateWardrobeItem(companyId: string, id: string, data: WardrobeItemUpdateInput): Promise<WardrobeItem> {
  const result = await prisma.wardrobeItem.updateMany({
    where: { id, companyId },
    data: {
      name: data.name,
      designer: data.designer === '' ? null : data.designer,
      stageTimelineItemId: data.stageTimelineItemId === '' ? null : data.stageTimelineItemId,
      candidateId: data.candidateId === '' ? null : data.candidateId,
      status: data.status,
      notes: data.notes === '' ? null : data.notes,
    },
  });
  if (result.count === 0) throw new Error('Prenda no encontrada');

  const updated = await prisma.wardrobeItem.findFirst({ where: { id, companyId } });
  if (!updated) throw new Error('Prenda no encontrada');
  return updated;
}

export async function deleteWardrobeItem(companyId: string, id: string): Promise<void> {
  const result = await prisma.wardrobeItem.deleteMany({ where: { id, companyId } });
  if (result.count === 0) throw new Error('Prenda no encontrada');
}

export type WardrobeItemWithRelations = WardrobeItem & {
  candidate: { id: string; fullName: string; stageName: string | null } | null;
  stageTimelineItem: { id: string; title: string; blockOrder: number } | null;
};

export async function listWardrobeItems(companyId: string, projectId: string): Promise<WardrobeItemWithRelations[]> {
  return prisma.wardrobeItem.findMany({
    where: { companyId, projectId },
    include: {
      candidate: { select: { id: true, fullName: true, stageName: true } },
      stageTimelineItem: { select: { id: true, title: true, blockOrder: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
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
}

export async function listCandidateOptions(companyId: string, projectId: string): Promise<ProductionCandidateOption[]> {
  return prisma.candidate.findMany({
    where: { companyId, projectId },
    select: { id: true, fullName: true, stageName: true },
    orderBy: { fullName: 'asc' },
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

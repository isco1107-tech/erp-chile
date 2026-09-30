import type { InspectionKind, InspectionStatus, Prisma, ProcedureCategory, ProcedureStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { evaluateInspection, supplierScorecard, type QualityParameter, type SupplierScore } from '@/lib/quality/inspection';
import { ackSummary, isReviewDue, pendingAcknowledgements } from '@/lib/quality/procedures';
import { STARTER_PROCEDURES, STARTER_TEMPLATES } from '@/lib/quality/starter';
import type { InspectionInput, ProcedureInput, SupplierProfileInput, TemplateInput } from '../schema';

/**
 * Calidad y procedimientos. Toda consulta lleva `companyId`; los ids de
 * producto, productor y plantilla que llegan del cliente se validan contra la
 * empresa antes de guardar. El resultado de una inspección (aprobada o no) lo
 * calcula SIEMPRE el servidor con `evaluateInspection`.
 */

export class QualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QualityError';
  }
}

// ── Procedimientos ───────────────────────────────────────────────────────────

export interface ProcedureRow {
  id: string;
  title: string;
  category: ProcedureCategory;
  summary: string | null;
  version: number;
  status: ProcedureStatus;
  reviewEveryDays: number | null;
  lastReviewedAt: Date | null;
  reviewDue: boolean;
  /** ¿La persona que consulta ya leyó la versión vigente? */
  acknowledged: boolean;
  readCount: number;
  teamCount: number;
  updatedAt: Date;
}

/** Los borradores solo los ve quien gestiona procedimientos (`includeDrafts`): al equipo llegan recién al publicarse. */
export async function listProcedures(companyId: string, userId: string, includeDrafts: boolean, now: Date = new Date()): Promise<ProcedureRow[]> {
  const [procedures, acks, team] = await Promise.all([
    prisma.procedure.findMany({ where: { companyId, status: includeDrafts ? { not: 'ARCHIVED' } : 'ACTIVE' }, orderBy: [{ status: 'asc' }, { category: 'asc' }, { title: 'asc' }] }),
    prisma.procedureAck.findMany({ where: { companyId }, select: { procedureId: true, userId: true, version: true } }),
    prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true } }),
  ]);
  const pending = new Set(pendingAcknowledgements(procedures, acks, userId).map((p) => p.id));
  const teamIds = team.map((u) => u.id);
  return procedures.map((p) => {
    const summary = ackSummary(p, acks, teamIds);
    return {
      id: p.id,
      title: p.title,
      category: p.category,
      summary: p.summary,
      version: p.version,
      status: p.status,
      reviewEveryDays: p.reviewEveryDays,
      lastReviewedAt: p.lastReviewedAt,
      reviewDue: isReviewDue(p, now),
      acknowledged: p.status === 'ACTIVE' && !pending.has(p.id),
      readCount: summary.read,
      teamCount: summary.team,
      updatedAt: p.updatedAt,
    };
  });
}

export async function getProcedure(companyId: string, id: string) {
  return prisma.procedure.findFirst({ where: { id, companyId } });
}

export async function createProcedure(companyId: string, ownerId: string, input: ProcedureInput): Promise<{ id: string }> {
  return prisma.procedure.create({
    data: { companyId, ownerId, title: input.title, category: input.category, summary: input.summary || null, content: input.content, reviewEveryDays: input.reviewEveryDays ?? null },
    select: { id: true },
  });
}

/**
 * Editar un procedimiento vigente sube su versión: quienes ya lo habían leído
 * deben leerlo de nuevo. Un borrador se edita sin cambiar de versión.
 */
export async function updateProcedure(companyId: string, id: string, input: ProcedureInput): Promise<{ version: number }> {
  const current = await prisma.procedure.findFirst({ where: { id, companyId } });
  if (!current) throw new QualityError('Procedimiento no encontrado');
  if (current.status === 'ARCHIVED') throw new QualityError('Un procedimiento archivado no se edita');
  const changed = current.title !== input.title || current.content !== input.content || (current.summary ?? '') !== (input.summary ?? '');
  const bump = current.status === 'ACTIVE' && changed;
  const result = await prisma.procedure.updateMany({
    where: { id, companyId, version: current.version },
    data: {
      title: input.title,
      category: input.category,
      summary: input.summary || null,
      content: input.content,
      reviewEveryDays: input.reviewEveryDays ?? null,
      ...(bump ? { version: { increment: 1 }, lastReviewedAt: new Date() } : {}),
    },
  });
  if (result.count === 0) throw new QualityError('El procedimiento cambió mientras lo editabas. Recarga e inténtalo de nuevo');
  return { version: bump ? current.version + 1 : current.version };
}

export async function setProcedureStatus(companyId: string, id: string, status: 'ACTIVE' | 'ARCHIVED'): Promise<void> {
  const result = await prisma.procedure.updateMany({
    where: { id, companyId, status: { not: status } },
    data: { status, ...(status === 'ACTIVE' ? { lastReviewedAt: new Date() } : {}) },
  });
  if (result.count === 0) throw new QualityError('El procedimiento no existe o ya tiene ese estado');
}

export async function markProcedureReviewed(companyId: string, id: string): Promise<void> {
  const result = await prisma.procedure.updateMany({ where: { id, companyId, status: 'ACTIVE' }, data: { lastReviewedAt: new Date() } });
  if (result.count === 0) throw new QualityError('Solo se revisan procedimientos vigentes');
}

/** "Leí y entendí": queda registrado por persona y versión. Repetirlo no duplica. */
export async function acknowledgeProcedure(companyId: string, userId: string, id: string): Promise<void> {
  const procedure = await prisma.procedure.findFirst({ where: { id, companyId, status: 'ACTIVE' }, select: { id: true, version: true } });
  if (!procedure) throw new QualityError('Este procedimiento no está vigente');
  await prisma.procedureAck.upsert({
    where: { procedureId_userId_version: { procedureId: id, userId, version: procedure.version } },
    update: {},
    create: { companyId, procedureId: id, userId, version: procedure.version },
  });
}

/** Carga los procedimientos y plantillas iniciales (una sola vez por título/nombre; no pisa lo que ya existe). */
export async function installStarterPack(companyId: string, ownerId: string): Promise<{ procedures: number; templates: number }> {
  const [existingProcedures, existingTemplates] = await Promise.all([
    prisma.procedure.findMany({ where: { companyId }, select: { title: true } }),
    prisma.qualityTemplate.findMany({ where: { companyId }, select: { name: true } }),
  ]);
  const haveProcedures = new Set(existingProcedures.map((p) => p.title));
  const haveTemplates = new Set(existingTemplates.map((t) => t.name));
  const newProcedures = STARTER_PROCEDURES.filter((p) => !haveProcedures.has(p.title));
  const newTemplates = STARTER_TEMPLATES.filter((t) => !haveTemplates.has(t.name));
  if (newProcedures.length > 0) {
    await prisma.procedure.createMany({
      data: newProcedures.map((p) => ({ companyId, ownerId, title: p.title, category: p.category, summary: p.summary, content: p.content, reviewEveryDays: p.reviewEveryDays })),
    });
  }
  if (newTemplates.length > 0) {
    await prisma.qualityTemplate.createMany({
      data: newTemplates.map((t) => ({ companyId, name: t.name, kind: t.kind, parameters: t.parameters as unknown as Prisma.InputJsonValue })),
    });
  }
  return { procedures: newProcedures.length, templates: newTemplates.length };
}

// ── Plantillas ───────────────────────────────────────────────────────────────

export interface TemplateRow {
  id: string;
  name: string;
  kind: InspectionKind;
  parameters: QualityParameter[];
  isActive: boolean;
}

export async function listTemplates(companyId: string, onlyActive = false): Promise<TemplateRow[]> {
  const rows = await prisma.qualityTemplate.findMany({ where: { companyId, ...(onlyActive ? { isActive: true } : {}) }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, parameters: r.parameters as unknown as QualityParameter[], isActive: r.isActive }));
}

export async function saveTemplate(companyId: string, id: string | null, input: TemplateInput): Promise<{ id: string }> {
  const data = { name: input.name, kind: input.kind, parameters: input.parameters as unknown as Prisma.InputJsonValue, isActive: input.isActive };
  if (!id) return prisma.qualityTemplate.create({ data: { companyId, ...data }, select: { id: true } });
  const result = await prisma.qualityTemplate.updateMany({ where: { id, companyId }, data });
  if (result.count === 0) throw new QualityError('Plantilla no encontrada');
  return { id };
}

// ── Inspecciones ─────────────────────────────────────────────────────────────

export interface InspectionRow {
  id: string;
  templateName: string;
  kind: InspectionKind;
  status: InspectionStatus;
  failedParameters: string[];
  lotNumber: string | null;
  productName: string | null;
  supplierName: string | null;
  notes: string | null;
  correctiveAction: string | null;
  inspectedAt: Date;
}

export async function listInspections(companyId: string, filter: { status?: InspectionStatus; contactId?: string } = {}): Promise<InspectionRow[]> {
  const rows = await prisma.qualityInspection.findMany({
    where: { companyId, ...(filter.status ? { status: filter.status } : {}), ...(filter.contactId ? { contactId: filter.contactId } : {}) },
    orderBy: { inspectedAt: 'desc' },
    take: 200,
  });
  const productIds = [...new Set(rows.flatMap((r) => (r.productId ? [r.productId] : [])))];
  const contactIds = [...new Set(rows.flatMap((r) => (r.contactId ? [r.contactId] : [])))];
  const [products, contacts] = await Promise.all([
    productIds.length ? prisma.product.findMany({ where: { companyId, id: { in: productIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    contactIds.length ? prisma.contact.findMany({ where: { companyId, id: { in: contactIds } }, select: { id: true, razonSocial: true, nombreFantasia: true } }) : Promise.resolve([]),
  ]);
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const contactName = new Map(contacts.map((c) => [c.id, c.nombreFantasia || c.razonSocial]));
  return rows.map((r) => ({
    id: r.id,
    templateName: r.templateName,
    kind: r.kind,
    status: r.status,
    failedParameters: r.failedParameters,
    lotNumber: r.lotNumber,
    productName: r.productId ? (productName.get(r.productId) ?? null) : null,
    supplierName: r.contactId ? (contactName.get(r.contactId) ?? null) : null,
    notes: r.notes,
    correctiveAction: r.correctiveAction,
    inspectedAt: r.inspectedAt,
  }));
}

export interface CreatedInspection {
  id: string;
  status: InspectionStatus;
  failed: string[];
  templateName: string;
  lotNumber: string | null;
}

export async function createInspection(companyId: string, inspectorId: string, input: InspectionInput): Promise<CreatedInspection> {
  const template = await prisma.qualityTemplate.findFirst({ where: { id: input.templateId, companyId, isActive: true } });
  if (!template) throw new QualityError('Plantilla no encontrada o desactivada');
  if (input.productId) {
    const product = await prisma.product.findFirst({ where: { id: input.productId, companyId }, select: { id: true } });
    if (!product) throw new QualityError('Producto no encontrado');
  }
  if (input.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: input.contactId, companyId }, select: { id: true } });
    if (!contact) throw new QualityError('Productor o proveedor no encontrado');
  }
  const parameters = template.parameters as unknown as QualityParameter[];
  const evaluation = evaluateInspection(parameters, input.values);
  if (evaluation.missing.length > 0) throw new QualityError(`Falta completar: ${evaluation.missing.join(', ')}`);
  if (evaluation.status === 'FAILED' && !input.correctiveAction?.trim()) {
    throw new QualityError('La inspección no aprobó: anota qué se hizo con el lote (acción correctiva)');
  }
  const created = await prisma.qualityInspection.create({
    data: {
      companyId,
      templateId: template.id,
      templateName: template.name,
      kind: template.kind,
      productId: input.productId ?? null,
      contactId: input.contactId ?? null,
      lotNumber: input.lotNumber || null,
      parameters: parameters as unknown as Prisma.InputJsonValue,
      results: evaluation.results as unknown as Prisma.InputJsonValue,
      status: evaluation.status,
      failedParameters: evaluation.failed,
      inspectorId,
      notes: input.notes || null,
      correctiveAction: input.correctiveAction || null,
    },
    select: { id: true },
  });
  return { id: created.id, status: evaluation.status, failed: evaluation.failed, templateName: template.name, lotNumber: input.lotNumber || null };
}

// ── Productores y proveedores ────────────────────────────────────────────────

export interface SupplierRow {
  contactId: string;
  name: string;
  comuna: string | null;
  phone: string | null;
  supplierType: string | null;
  suppliedProducts: string | null;
  certifications: string | null;
  isLocalProducer: boolean;
  isActive: boolean;
  notes: string | null;
  hasProfile: boolean;
  score: SupplierScore | null;
}

export async function listSuppliers(companyId: string): Promise<SupplierRow[]> {
  const [contacts, inspections] = await Promise.all([
    prisma.contact.findMany({
      where: { companyId, isSupplier: true },
      orderBy: { razonSocial: 'asc' },
      take: 500,
      select: { id: true, razonSocial: true, nombreFantasia: true, comuna: true, phone: true, supplierProfile: true },
    }),
    prisma.qualityInspection.findMany({ where: { companyId, kind: 'INCOMING', contactId: { not: null } }, select: { contactId: true, status: true, inspectedAt: true } }),
  ]);
  const scores = new Map(supplierScorecard(inspections.flatMap((i) => (i.contactId ? [{ contactId: i.contactId, status: i.status, inspectedAt: i.inspectedAt }] : []))).map((s) => [s.contactId, s]));
  return contacts.map((c) => ({
    contactId: c.id,
    name: c.nombreFantasia || c.razonSocial,
    comuna: c.comuna,
    phone: c.phone,
    supplierType: c.supplierProfile?.supplierType ?? null,
    suppliedProducts: c.supplierProfile?.suppliedProducts ?? null,
    certifications: c.supplierProfile?.certifications ?? null,
    isLocalProducer: c.supplierProfile?.isLocalProducer ?? true,
    isActive: c.supplierProfile?.isActive ?? true,
    notes: c.supplierProfile?.notes ?? null,
    hasProfile: c.supplierProfile !== null,
    score: scores.get(c.id) ?? null,
  }));
}

export async function saveSupplierProfile(companyId: string, input: SupplierProfileInput): Promise<void> {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, companyId, isSupplier: true }, select: { id: true } });
  if (!contact) throw new QualityError('Solo se puede completar la ficha de contactos marcados como proveedor');
  const data = {
    supplierType: input.supplierType,
    suppliedProducts: input.suppliedProducts || null,
    certifications: input.certifications || null,
    isLocalProducer: input.isLocalProducer,
    isActive: input.isActive,
    notes: input.notes || null,
  };
  await prisma.supplierProfile.upsert({ where: { contactId: input.contactId }, update: data, create: { companyId, contactId: input.contactId, ...data } });
}

// ── Panel ────────────────────────────────────────────────────────────────────

export interface QualityOverview {
  inspections30d: number;
  failed30d: number;
  /** % aprobado en 30 días; `null` si no hubo inspecciones. */
  passRate30d: number | null;
  proceduresActive: number;
  proceduresDraft: number;
  reviewsDue: number;
  pendingForMe: number;
  suppliers: number;
}

export async function getOverview(companyId: string, userId: string, includeDrafts: boolean, now: Date = new Date()): Promise<QualityOverview> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [inspections, procedures, acks, suppliers] = await Promise.all([
    prisma.qualityInspection.groupBy({ by: ['status'], where: { companyId, inspectedAt: { gte: since } }, _count: { _all: true } }),
    prisma.procedure.findMany({ where: { companyId, status: includeDrafts ? { not: 'ARCHIVED' } : 'ACTIVE' } }),
    prisma.procedureAck.findMany({ where: { companyId, userId }, select: { procedureId: true, userId: true, version: true } }),
    prisma.contact.count({ where: { companyId, isSupplier: true } }),
  ]);
  const passed = inspections.find((i) => i.status === 'PASSED')?._count._all ?? 0;
  const failed = inspections.find((i) => i.status === 'FAILED')?._count._all ?? 0;
  const total = passed + failed;
  return {
    inspections30d: total,
    failed30d: failed,
    passRate30d: total === 0 ? null : Math.round((passed / total) * 100),
    proceduresActive: procedures.filter((p) => p.status === 'ACTIVE').length,
    proceduresDraft: procedures.filter((p) => p.status === 'DRAFT').length,
    reviewsDue: procedures.filter((p) => isReviewDue(p, now)).length,
    pendingForMe: pendingAcknowledgements(procedures, acks, userId).length,
    suppliers,
  };
}

import 'server-only';

import type { ExpenseItem, ExpenseReport, Payment, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ensureExpenseReportAccrual, postExpenseReportApproved } from '@/modules/accounting/posting-rules/people-posting';
import { recordTreasuryMovement } from '@/modules/treasury/services/movements.service';
import type { MoneyDetailsInput } from '@/modules/treasury/schema';
import { formatRut } from '@/lib/chile/rut';
import { startOfMonthSantiago } from '@/lib/chile/timezone';
import type { ExpenseItemInput, ExpenseReportInput, ExpenseReviewInput } from '../schema';

/**
 * Rendición de gastos con flujo de aprobación:
 *
 *   DRAFT ──enviar──▶ SUBMITTED ──aprobar──▶ APPROVED ──reembolsar──▶ REIMBURSED
 *     ▲                   │
 *     └──── corregir ◀── REJECTED
 *
 * Reglas: solo quien rinde edita (en borrador o rechazada); nadie aprueba su
 * propia rendición aunque tenga el permiso; solo se reembolsa lo aprobado.
 * Cada transición es un `updateMany` condicionado al estado esperado, así dos
 * clics simultáneos no pueden aprobar y rechazar la misma rendición.
 */

export interface Viewer {
  userId: string;
  /** Ve y gestiona las rendiciones de todo el equipo (aprobar o reembolsar). */
  canSeeAll: boolean;
}

const reportInclude = {
  submittedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { name: true } },
  project: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.ExpenseReportInclude;

export type ExpenseReportRow = Prisma.ExpenseReportGetPayload<{ include: typeof reportInclude }>;
export type ExpenseReportDetail = ExpenseReportRow & { items: ExpenseItem[] };

function visibility(companyId: string, viewer: Viewer): Prisma.ExpenseReportWhereInput {
  return viewer.canSeeAll ? { companyId } : { companyId, submittedByUserId: viewer.userId };
}

export async function listReports(companyId: string, viewer: Viewer): Promise<ExpenseReportRow[]> {
  return prisma.expenseReport.findMany({
    where: visibility(companyId, viewer),
    include: reportInclude,
    orderBy: [{ updatedAt: 'desc' }],
    take: 300,
  });
}

export async function getReport(companyId: string, id: string, viewer: Viewer): Promise<ExpenseReportDetail | null> {
  return prisma.expenseReport.findFirst({
    where: { ...visibility(companyId, viewer), id },
    include: { ...reportInclude, items: { orderBy: { expenseDate: 'asc' } } },
  });
}

async function assertProject(companyId: string, projectId: string | undefined): Promise<void> {
  if (!projectId) return;
  const found = await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } });
  if (!found) throw new Error('El proyecto seleccionado no existe en tu empresa');
}

export async function createReport(companyId: string, userId: string, input: ExpenseReportInput): Promise<ExpenseReport> {
  await assertProject(companyId, input.projectId);
  return prisma.expenseReport.create({ data: { companyId, submittedByUserId: userId, title: input.title, projectId: input.projectId ?? null } });
}

/** La rendición propia y editable (borrador o rechazada), o error. */
async function findEditable(companyId: string, userId: string, reportId: string): Promise<ExpenseReport> {
  const report = await prisma.expenseReport.findFirst({ where: { id: reportId, companyId, submittedByUserId: userId } });
  if (!report) throw new Error('La rendición no existe o no es tuya');
  if (report.status !== 'DRAFT' && report.status !== 'REJECTED') throw new Error('La rendición ya fue enviada: no se puede modificar');
  return report;
}

async function recomputeTotal(tx: Prisma.TransactionClient, companyId: string, reportId: string): Promise<void> {
  const total = await tx.expenseItem.aggregate({ where: { companyId, reportId }, _sum: { amount: true } });
  await tx.expenseReport.updateMany({ where: { id: reportId, companyId }, data: { totalAmount: total._sum.amount ?? 0 } });
}

/**
 * Lock + re-chequeo dentro de la transacción: sin esto, un gasto agregado
 * mientras otra pestaña enviaba (y alguien aprobaba) la rendición entraba
 * igual, cambiando el total ya aprobado.
 */
async function lockEditable(tx: Prisma.TransactionClient, companyId: string, userId: string, reportId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "ExpenseReport" WHERE id = ${reportId} AND "companyId" = ${companyId} FOR UPDATE`;
  const report = await tx.expenseReport.findFirst({ where: { id: reportId, companyId, submittedByUserId: userId }, select: { status: true } });
  if (!report) throw new Error('La rendición no existe o no es tuya');
  if (report.status !== 'DRAFT' && report.status !== 'REJECTED') throw new Error('La rendición ya fue enviada: no se puede modificar');
}

export async function addItem(companyId: string, userId: string, reportId: string, input: ExpenseItemInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockEditable(tx, companyId, userId, reportId);
    await tx.expenseItem.create({
      data: {
        companyId,
        reportId,
        expenseDate: input.expenseDate,
        category: input.category,
        description: input.description,
        documentType: input.documentType,
        documentNumber: input.documentNumber ?? null,
        supplierName: input.supplierName ?? null,
        supplierRut: input.supplierRut ? formatRut(input.supplierRut) : null,
        amount: input.amount,
      },
    });
    await recomputeTotal(tx, companyId, reportId);
  });
}

export async function removeItem(companyId: string, userId: string, reportId: string, itemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockEditable(tx, companyId, userId, reportId);
    const result = await tx.expenseItem.deleteMany({ where: { id: itemId, reportId, companyId } });
    if (result.count === 0) throw new Error('El gasto no existe');
    await recomputeTotal(tx, companyId, reportId);
  });
}

export async function submitReport(companyId: string, userId: string, reportId: string): Promise<ExpenseReportDetail> {
  const report = await findEditable(companyId, userId, reportId);
  const items = await prisma.expenseItem.count({ where: { companyId, reportId } });
  if (items === 0) throw new Error('Agrega al menos un gasto antes de enviar la rendición');
  const result = await prisma.expenseReport.updateMany({
    where: { id: reportId, companyId, status: report.status },
    data: { status: 'SUBMITTED', submittedAt: new Date(), reviewedByUserId: null, reviewedAt: null, reviewNotes: null },
  });
  if (result.count === 0) throw new Error('La rendición cambió de estado mientras la enviabas. Recarga e inténtalo de nuevo.');
  return (await getReport(companyId, reportId, { userId, canSeeAll: true })) as ExpenseReportDetail;
}

/**
 * Aprobar reconoce el gasto: con Contabilidad activa, el asiento (gasto contra
 * rendiciones por pagar) nace en la misma transacción que el cambio de estado.
 */
export async function reviewReport(companyId: string, reviewerId: string, reportId: string, input: ExpenseReviewInput): Promise<void> {
  const report = await prisma.expenseReport.findFirst({ where: { id: reportId, companyId }, select: { submittedByUserId: true } });
  if (!report) throw new Error('La rendición no existe');
  if (report.submittedByUserId === reviewerId) throw new Error('No puedes aprobar ni rechazar tu propia rendición: debe revisarla otra persona');
  await prisma.$transaction(async (tx) => {
    const reviewedAt = new Date();
    const result = await tx.expenseReport.updateMany({
      where: { id: reportId, companyId, status: 'SUBMITTED' },
      data: { status: input.decision, reviewedByUserId: reviewerId, reviewedAt, reviewNotes: input.notes ?? null },
    });
    if (result.count === 0) throw new Error('La rendición ya no está esperando revisión');
    if (input.decision !== 'APPROVED') return;
    const approved = await tx.expenseReport.findFirstOrThrow({ where: { id: reportId, companyId }, select: { id: true, title: true, totalAmount: true } });
    await postExpenseReportApproved(tx, companyId, { ...approved, approvedAt: reviewedAt }, reviewerId);
  });
}

/**
 * Reembolsar es un egreso de Tesorería contra `RENDICIONES_POR_PAGAR`. El
 * cambio de estado condicionado a APPROVED es el candado: si dos personas
 * reembolsan a la vez, solo una transacción lo encuentra aprobado.
 */
export async function reimburseReport(companyId: string, reportId: string, details: MoneyDetailsInput, userId?: string): Promise<Payment> {
  return prisma.$transaction(async (tx) => {
    const reimbursedAt = details.paymentDate ?? new Date();
    const result = await tx.expenseReport.updateMany({
      where: { id: reportId, companyId, status: 'APPROVED' },
      data: { status: 'REIMBURSED', reimbursedAt, reimbursementReference: details.referenceNumber ?? null },
    });
    if (result.count === 0) throw new Error('Solo se pueden reembolsar rendiciones aprobadas');
    const report = await tx.expenseReport.findFirstOrThrow({
      where: { id: reportId, companyId },
      select: { id: true, title: true, totalAmount: true, projectId: true, reviewedAt: true, submittedBy: { select: { name: true } } },
    });
    // Rendiciones aprobadas antes de que existiera el asiento de aprobación.
    await ensureExpenseReportAccrual(
      tx,
      companyId,
      { id: report.id, title: report.title, totalAmount: report.totalAmount, approvedAt: report.reviewedAt ?? reimbursedAt },
      userId
    );
    return recordTreasuryMovement(tx, {
      companyId,
      direction: 'EXPENSE',
      amount: report.totalAmount,
      method: details.paymentMethod,
      date: reimbursedAt,
      source: 'EXPENSE_REPORT',
      sourceId: report.id,
      description: `Reembolso rendición "${report.title}"${report.submittedBy ? ` — ${report.submittedBy.name}` : ''}`,
      counterpartKey: 'RENDICIONES_POR_PAGAR',
      projectId: report.projectId,
      treasuryAccountId: details.treasuryAccountId,
      referenceNumber: details.referenceNumber,
      createdByUserId: userId,
    });
  });
}

export async function deleteReport(companyId: string, userId: string, reportId: string): Promise<void> {
  const result = await prisma.expenseReport.deleteMany({ where: { id: reportId, companyId, submittedByUserId: userId, status: 'DRAFT' } });
  if (result.count === 0) throw new Error('Solo puedes eliminar tus rendiciones en borrador');
}

export interface ExpensesSummary {
  pendingReviewCount: number;
  pendingReviewAmount: number;
  toReimburseAmount: number;
  reimbursedThisMonth: number;
  byCategory: Array<{ category: string; amount: number }>;
}

export async function getExpensesSummary(companyId: string, viewer: Viewer): Promise<ExpensesSummary> {
  const scope = visibility(companyId, viewer);
  const monthStart = startOfMonthSantiago(new Date());
  const [pending, approved, reimbursed, categories] = await Promise.all([
    prisma.expenseReport.aggregate({ where: { ...scope, status: 'SUBMITTED' }, _count: { _all: true }, _sum: { totalAmount: true } }),
    prisma.expenseReport.aggregate({ where: { ...scope, status: 'APPROVED' }, _sum: { totalAmount: true } }),
    prisma.expenseReport.aggregate({ where: { ...scope, status: 'REIMBURSED', reimbursedAt: { gte: monthStart } }, _sum: { totalAmount: true } }),
    prisma.expenseItem.groupBy({
      by: ['category'],
      where: { companyId, report: { ...scope, status: { in: ['APPROVED', 'REIMBURSED'] } }, expenseDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      _sum: { amount: true },
    }),
  ]);
  return {
    pendingReviewCount: pending._count._all,
    pendingReviewAmount: pending._sum.totalAmount ?? 0,
    toReimburseAmount: approved._sum.totalAmount ?? 0,
    reimbursedThisMonth: reimbursed._sum.totalAmount ?? 0,
    byCategory: categories.map((c) => ({ category: c.category, amount: c._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount),
  };
}

export async function listProjectOptions(companyId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.project.findMany({ where: { companyId, status: { in: ['PLANNING', 'IN_PROGRESS'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

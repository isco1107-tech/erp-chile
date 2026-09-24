'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage, can, type AuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import { expenseItemSchema, expenseReimburseSchema, expenseReportSchema, expenseReviewSchema } from '../schema';
import * as expensesService from '../services/expenses.service';
import type { ExpenseReportDetail, ExpenseReportRow, ExpensesSummary, Viewer } from '../services/expenses.service';
import { emitPaymentEvent } from '@/modules/treasury/services/movements.service';
import { listTreasuryAccountOptions, type TreasuryAccountOption } from '@/modules/treasury/services/accounts.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

function viewerOf(session: AuthContext): Viewer {
  return { userId: session.id, canSeeAll: can(session, 'expenses:approve') || can(session, 'expenses:reimburse') };
}

function revalidateExpenses() {
  revalidatePath('/dashboard/expenses');
}

export interface ExpensesBoard {
  reports: ExpenseReportRow[];
  summary: ExpensesSummary;
  projects: Array<{ id: string; name: string }>;
  currentUserId: string;
  canApprove: boolean;
  canReimburse: boolean;
  /** Cajas/bancos para elegir desde dónde sale el reembolso (vacío si no puede reembolsar). */
  treasuryAccounts: TreasuryAccountOption[];
}

export async function getExpensesBoardAction(): Promise<ActionResult<ExpensesBoard>> {
  try {
    const session = await requireAuthWithPermission('expenses:submit');
    const viewer = viewerOf(session);
    const canReimburse = can(session, 'expenses:reimburse');
    const [reports, summary, projects, treasuryAccounts] = await Promise.all([
      expensesService.listReports(session.companyId, viewer),
      expensesService.getExpensesSummary(session.companyId, viewer),
      session.features.hasEventProjects ? expensesService.listProjectOptions(session.companyId) : Promise.resolve([]),
      canReimburse ? listTreasuryAccountOptions(session.companyId) : Promise.resolve([]),
    ]);
    return {
      success: true,
      data: { reports, summary, projects, currentUserId: session.id, canApprove: can(session, 'expenses:approve'), canReimburse, treasuryAccounts },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getExpenseReportAction(id: string): Promise<ActionResult<ExpenseReportDetail>> {
  try {
    const session = await requireAuthWithPermission('expenses:submit');
    const report = await expensesService.getReport(session.companyId, id, viewerOf(session));
    if (!report) return { success: false, error: 'La rendición no existe o no tienes acceso' };
    return { success: true, data: report };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createExpenseReportAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('expenses:submit');
    const parsed = expenseReportSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const report = await expensesService.createReport(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'ExpenseReport', entityId: report.id, metadata: { title: report.title } });
    revalidateExpenses();
    return { success: true, data: { id: report.id }, message: 'Rendición creada: agrega tus gastos' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function addExpenseItemAction(reportId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('expenses:submit');
    const parsed = expenseItemSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    await expensesService.addItem(session.companyId, session.id, reportId, parsed.data);
    revalidateExpenses();
    return { success: true, data: null, message: 'Gasto agregado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function removeExpenseItemAction(reportId: string, itemId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('expenses:submit');
    await expensesService.removeItem(session.companyId, session.id, reportId, itemId);
    revalidateExpenses();
    return { success: true, data: null, message: 'Gasto quitado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function submitExpenseReportAction(reportId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('expenses:submit');
    const report = await expensesService.submitReport(session.companyId, session.id, reportId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'ExpenseReport',
      entityId: reportId,
      metadata: { status: 'SUBMITTED', totalAmount: report.totalAmount },
    });
    void emitWorkflowEvent(session.companyId, 'EXPENSE_REPORT_SUBMITTED', {
      reportId,
      title: report.title,
      submitterName: report.submittedBy?.name ?? session.name,
      totalAmount: report.totalAmount,
      itemCount: report.items.length,
    });
    revalidateExpenses();
    return { success: true, data: null, message: 'Rendición enviada a aprobación' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function reviewExpenseReportAction(reportId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('expenses:approve');
    const parsed = expenseReviewSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    await expensesService.reviewReport(session.companyId, session.id, reportId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'ExpenseReport',
      entityId: reportId,
      metadata: { status: parsed.data.decision, notes: parsed.data.notes },
    });
    revalidateExpenses();
    return { success: true, data: null, message: parsed.data.decision === 'APPROVED' ? 'Rendición aprobada' : 'Rendición rechazada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function reimburseExpenseReportAction(reportId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('expenses:reimburse');
    const parsed = expenseReimburseSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const payment = await expensesService.reimburseReport(session.companyId, reportId, parsed.data, session.id);
    emitPaymentEvent(session.companyId, payment);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'ExpenseReport',
      entityId: reportId,
      metadata: { status: 'REIMBURSED', reference: parsed.data.referenceNumber ?? null, paymentId: payment.id },
    });
    revalidateExpenses();
    return { success: true, data: null, message: 'Reembolso registrado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteExpenseReportAction(reportId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('expenses:submit');
    await expensesService.deleteReport(session.companyId, session.id, reportId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'ExpenseReport', entityId: reportId });
    revalidateExpenses();
    return { success: true, data: null, message: 'Rendición eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

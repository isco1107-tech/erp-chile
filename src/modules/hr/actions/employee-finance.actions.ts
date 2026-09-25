'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import type { SettlementComputation } from '@/lib/chile/settlement';
import { employeeAdvanceSchema, employeeLoanSchema, payrollSettingsSchema, settlementSchema } from '../schema';
import * as finance from '../services/employee-finance.service';
import * as portal from '../services/employee-portal.service';
import type { EmployeeProfile, SettlementSuggestion } from '../services/employee-finance.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (!(error instanceof Error)) captureException(error, { module: 'remuneraciones', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateEmployee(employeeId: string): void {
  revalidatePath(`/dashboard/hr/employees/${employeeId}`);
  revalidatePath('/dashboard/hr');
}

export async function getEmployeeProfileAction(id: string): Promise<ActionResult<EmployeeProfile>> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const profile = await finance.getEmployeeProfile(session.companyId, String(id));
    if (!profile) return { success: false, error: 'El trabajador no existe o fue eliminado' };
    return { success: true, data: profile };
  } catch (error) {
    return fail(error);
  }
}

export async function createLoanAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    const parsed = employeeLoanSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const loan = await finance.createLoan(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'EmployeeLoan', entityId: loan.id, metadata: { employeeId: loan.employeeId, principal: loan.principal, installments: loan.installments } });
    revalidateEmployee(loan.employeeId);
    return { success: true, data: { id: loan.id }, message: 'Préstamo registrado: se descontará en las próximas liquidaciones' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function closeLoanAction(id: string, employeeId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    const status = await finance.closeLoan(session.companyId, String(id));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'EmployeeLoan', entityId: String(id), metadata: { status } });
    revalidateEmployee(String(employeeId));
    return { success: true, data: null, message: status === 'CANCELLED' ? 'Préstamo anulado' : 'Préstamo saldado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function createAdvanceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    const parsed = employeeAdvanceSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const advance = await finance.createAdvance(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'EmployeeAdvance', entityId: advance.id, metadata: { employeeId: advance.employeeId, amount: advance.amount } });
    revalidateEmployee(advance.employeeId);
    return { success: true, data: { id: advance.id }, message: 'Anticipo registrado: se descontará en la liquidación del mes' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function cancelAdvanceAction(id: string, employeeId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    await finance.cancelAdvance(session.companyId, String(id));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'EmployeeAdvance', entityId: String(id), metadata: { status: 'CANCELLED' } });
    revalidateEmployee(String(employeeId));
    return { success: true, data: null, message: 'Anticipo anulado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function suggestSettlementAction(employeeId: string, terminationDate: string): Promise<ActionResult<SettlementSuggestion>> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(terminationDate) ? new Date(`${terminationDate}T12:00:00Z`) : new Date();
    return { success: true, data: await finance.suggestSettlement(session.companyId, String(employeeId), date) };
  } catch (error) {
    return fail(error);
  }
}

export async function previewSettlementAction(input: unknown): Promise<ActionResult<SettlementComputation>> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const parsed = settlementSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    return { success: true, data: await finance.previewSettlement(session.companyId, parsed.data) };
  } catch (error) {
    return fail(error);
  }
}

export async function saveSettlementAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    const parsed = settlementSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const settlement = await finance.saveSettlement(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'EmployeeSettlement', entityId: settlement.id, metadata: { employeeId: settlement.employeeId, cause: settlement.cause, totalAmount: settlement.totalAmount } });
    revalidateEmployee(settlement.employeeId);
    return { success: true, data: { id: settlement.id }, message: 'Finiquito guardado en borrador' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function finalizeSettlementAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:close');
    companyId = session.companyId;
    const settlement = await finance.finalizeSettlement(session.companyId, String(id));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'EmployeeSettlement', entityId: settlement.id, metadata: { status: 'FINAL', totalAmount: settlement.totalAmount } });
    revalidateEmployee(settlement.employeeId);
    return { success: true, data: null, message: 'Finiquito definitivo: el trabajador quedó con término registrado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function cancelSettlementAction(id: string, employeeId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    await finance.cancelSettlement(session.companyId, String(id));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'EmployeeSettlement', entityId: String(id), metadata: { status: 'CANCELLED' } });
    revalidateEmployee(String(employeeId));
    return { success: true, data: null, message: 'Finiquito anulado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function createPortalLinkAction(employeeId: string): Promise<ActionResult<{ token: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    const token = await portal.createPortalLink(session.companyId, String(employeeId));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Employee', entityId: String(employeeId), metadata: { reason: 'employee_portal_link_created' } });
    revalidateEmployee(String(employeeId));
    return { success: true, data: { token }, message: 'Enlace generado. Cópialo ahora: por seguridad no se vuelve a mostrar' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function revokePortalLinkAction(employeeId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    await portal.revokePortalLink(session.companyId, String(employeeId));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Employee', entityId: String(employeeId), metadata: { reason: 'employee_portal_link_revoked' } });
    revalidateEmployee(String(employeeId));
    return { success: true, data: null, message: 'Enlace revocado: el anterior ya no funciona' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function getPayrollSettingsAction(): Promise<ActionResult<{ mutualCode: string }>> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const settings = await prisma.companySettings.findUnique({ where: { companyId: session.companyId }, select: { payrollMutualCode: true } });
    return { success: true, data: { mutualCode: settings?.payrollMutualCode ?? 'ISL' } };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePayrollSettingsAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('payroll:write');
    companyId = session.companyId;
    const parsed = payrollSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await prisma.companySettings.upsert({
      where: { companyId: session.companyId },
      update: { payrollMutualCode: parsed.data.mutualCode },
      create: { companyId: session.companyId, payrollMutualCode: parsed.data.mutualCode },
    });
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'CompanySettings', entityId: session.companyId, metadata: { payrollMutualCode: parsed.data.mutualCode } });
    revalidatePath('/dashboard/hr/payroll');
    return { success: true, data: null, message: 'Organismo del seguro de accidentes actualizado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

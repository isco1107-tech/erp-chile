'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { emitWorkflowEvent } from '@/lib/workflows/engine';
import {
  employeeSchema,
  leaveRequestSchema,
  leaveReviewSchema,
  LEAVE_TYPE_LABELS,
  payrollPeriodSchema,
  payslipVariablesSchema,
  terminateEmployeeSchema,
} from '../schema';
import * as employeesService from '../services/employees.service';
import * as payrollService from '../services/payroll.service';
import * as leaveService from '../services/leave.service';
import type { EmployeeRow, HrSummary } from '../services/employees.service';
import type { PeriodDetail, PeriodSummary } from '../services/payroll.service';
import type { LeaveRow, VacationBalance } from '../services/leave.service';
import type { PayrollPeriodInput } from '../schema';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

// ── Trabajadores ────────────────────────────────────────────────────────────

export async function getEmployeesAction(): Promise<ActionResult<{ employees: EmployeeRow[]; summary: HrSummary }>> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const [employees, summary] = await Promise.all([employeesService.listEmployees(session.companyId), employeesService.getHrSummary(session.companyId)]);
    return { success: true, data: { employees, summary } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveEmployeeAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const employee = id
      ? await employeesService.updateEmployee(session.companyId, id, parsed.data)
      : await employeesService.createEmployee(session.companyId, parsed.data);
    // Sin sueldo ni cuenta bancaria en la bitácora: es dato sensible y la
    // auditoría solo necesita saber quién tocó qué ficha.
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'Employee',
      entityId: employee.id,
      metadata: { fullName: employee.fullName, position: employee.position },
    });
    revalidatePath('/dashboard/hr');
    return { success: true, data: { id: employee.id }, message: id ? 'Ficha actualizada' : 'Trabajador creado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function terminateEmployeeAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    const parsed = terminateEmployeeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    await employeesService.terminateEmployee(session.companyId, id, parsed.data.terminationDate);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Employee',
      entityId: id,
      metadata: { terminationDate: parsed.data.terminationDate.toISOString() },
    });
    revalidatePath('/dashboard/hr');
    return { success: true, data: null, message: 'Término registrado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function reactivateEmployeeAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    await employeesService.reactivateEmployee(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Employee', entityId: id, metadata: { reactivated: true } });
    revalidatePath('/dashboard/hr');
    return { success: true, data: null, message: 'Trabajador reactivado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteEmployeeAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    await employeesService.deleteEmployee(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'Employee', entityId: id });
    revalidatePath('/dashboard/hr');
    return { success: true, data: null, message: 'Trabajador eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ── Remuneraciones ──────────────────────────────────────────────────────────

export async function getPayrollPeriodsAction(): Promise<
  ActionResult<{ periods: PeriodSummary[]; suggested: Awaited<ReturnType<typeof payrollService.suggestedParameters>> }>
> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const [periods, suggested] = await Promise.all([payrollService.listPeriods(session.companyId), payrollService.suggestedParameters(session.companyId)]);
    return { success: true, data: { periods, suggested } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPayrollPeriodAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    const parsed = payrollPeriodSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const period = await payrollService.createPeriod(session.companyId, parsed.data as PayrollPeriodInput);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PayrollPeriod',
      entityId: period.id,
      metadata: { year: period.year, month: period.month, ufValue: period.ufValue, utmValue: period.utmValue },
    });
    revalidatePath('/dashboard/hr/payroll');
    return { success: true, data: { id: period.id }, message: 'Período abierto' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updatePayrollPeriodAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    const parsed = payrollPeriodSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    await payrollService.updatePeriodParameters(session.companyId, id, parsed.data as PayrollPeriodInput);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PayrollPeriod',
      entityId: id,
      metadata: { ufValue: parsed.data.ufValue, utmValue: parsed.data.utmValue },
    });
    revalidatePath(`/dashboard/hr/payroll/${id}`);
    return { success: true, data: null, message: 'Parámetros actualizados. Vuelve a calcular para aplicarlos.' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deletePayrollPeriodAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    await payrollService.deletePeriod(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'PayrollPeriod', entityId: id });
    revalidatePath('/dashboard/hr/payroll');
    return { success: true, data: null, message: 'Período eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPayrollPeriodDetailAction(id: string): Promise<ActionResult<PeriodDetail>> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    return { success: true, data: await payrollService.getPeriodDetail(session.companyId, id) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function calculatePayrollAction(periodId: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    const parsed = payslipVariablesSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const count = await payrollService.calculatePeriod(session.companyId, periodId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'PayrollPeriod', entityId: periodId, metadata: { calculated: count } });
    revalidatePath(`/dashboard/hr/payroll/${periodId}`);
    return { success: true, data: { count }, message: `${count} liquidación(es) calculadas` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function closePayrollPeriodAction(periodId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('payroll:close');
    const totals = await payrollService.closePeriod(session.companyId, periodId, session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PayrollPeriod',
      entityId: periodId,
      metadata: { closed: true, employeeCount: totals.employeeCount, totalNetPay: totals.totalNetPay },
    });
    void emitWorkflowEvent(session.companyId, 'PAYROLL_CLOSED', {
      periodLabel: totals.label,
      employeeCount: totals.employeeCount,
      totalNetPay: totals.totalNetPay,
      totalEmployerCost: totals.totalEmployerCost,
    });
    revalidatePath('/dashboard/hr/payroll');
    revalidatePath(`/dashboard/hr/payroll/${periodId}`);
    return { success: true, data: null, message: `Remuneraciones de ${totals.label} cerradas` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

// ── Vacaciones y permisos ───────────────────────────────────────────────────

export async function getLeaveBoardAction(): Promise<ActionResult<{ requests: LeaveRow[]; balances: VacationBalance[]; employees: Array<{ id: string; fullName: string }> }>> {
  try {
    const session = await requireAuthWithPermission('payroll:read');
    const [requests, balances] = await Promise.all([leaveService.listLeaveRequests(session.companyId), leaveService.getVacationBalances(session.companyId)]);
    return { success: true, data: { requests, balances, employees: balances.map((b) => ({ id: b.employeeId, fullName: b.fullName })) } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createLeaveRequestAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    const parsed = leaveRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const request = await leaveService.createLeaveRequest(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'LeaveRequest',
      entityId: request.id,
      metadata: { employee: request.employee.fullName, type: request.type, businessDays: request.businessDays },
    });
    void emitWorkflowEvent(session.companyId, 'LEAVE_REQUESTED', {
      requestId: request.id,
      employeeName: request.employee.fullName,
      type: LEAVE_TYPE_LABELS[request.type],
      businessDays: request.businessDays,
      startDate: request.startDate.toISOString().slice(0, 10),
    });
    revalidatePath('/dashboard/hr/leave');
    return { success: true, data: { id: request.id }, message: 'Solicitud registrada: queda pendiente de aprobación' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function reviewLeaveRequestAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('leave:approve');
    const parsed = leaveReviewSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const request = await leaveService.reviewLeaveRequest(session.companyId, id, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'LeaveRequest',
      entityId: id,
      metadata: { decision: request.status, notes: request.reviewNotes },
    });
    revalidatePath('/dashboard/hr/leave');
    return { success: true, data: null, message: parsed.data.decision === 'APPROVED' ? 'Solicitud aprobada' : 'Solicitud rechazada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function cancelLeaveRequestAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('payroll:write');
    await leaveService.cancelLeaveRequest(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'LeaveRequest', entityId: id, metadata: { cancelled: true } });
    revalidatePath('/dashboard/hr/leave');
    return { success: true, data: null, message: 'Solicitud anulada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { getAppUrl } from '@/lib/email/mailer';
import { approveApplicationSchema, attendanceSchema, groupSchema, monthPaymentSchema, periodSchema, studentSchema, isoDay } from '../schema';
import * as service from '../services/academy.service';
import * as enrollment from '../services/academy-enrollment.service';
import type { ApplicationRow } from '../services/academy-enrollment.service';
import type { AttendanceSheetRow, GroupRow, PaymentBoardRow, StudentDetail, StudentRow } from '../services/academy.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.AcademyError) return { success: false, error: error.message };
  captureException(error, { module: 'academia', companyId, extra });
  return { success: false, error: 'No se pudo completar la operación. Intenta de nuevo' };
}

const firstIssue = (issues: Array<{ message: string }>) => issues[0]?.message ?? 'Datos inválidos';

function revalidate(): void {
  revalidatePath('/dashboard/academy');
}

export async function listGroupsAction(): Promise<ActionResult<GroupRow[]>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    return { success: true, data: await service.listGroups(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function saveGroupAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:manage');
    companyId = session.companyId;
    const parsed = groupSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const saved = await service.saveGroup(session.companyId, id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: id ? 'UPDATE' : 'CREATE', entity: 'AcademyGroup', entityId: saved.id, metadata: { name: parsed.data.name } });
    revalidate();
    return { success: true, data: saved, message: 'Grupo guardado' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveGroup' });
  }
}

export async function setGroupActiveAction(id: string, isActive: boolean): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:manage');
    companyId = session.companyId;
    await service.setGroupActive(session.companyId, String(id), Boolean(isActive));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademyGroup', entityId: String(id), metadata: { isActive: Boolean(isActive) } });
    revalidate();
    return { success: true, data: null, message: isActive ? 'Grupo reactivado' : 'Grupo desactivado' };
  } catch (error) {
    return fail(error, companyId, { action: 'setGroupActive' });
  }
}

export async function listStudentsAction(filter: { groupId?: string; search?: string; includeInactive?: boolean } = {}): Promise<ActionResult<StudentRow[]>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    return {
      success: true,
      data: await service.listStudents(session.companyId, {
        groupId: typeof filter.groupId === 'string' && filter.groupId ? filter.groupId : undefined,
        search: typeof filter.search === 'string' ? filter.search.slice(0, 80) : undefined,
        includeInactive: filter.includeInactive === true,
      }),
    };
  } catch (error) {
    return fail(error);
  }
}

export async function getStudentAction(id: string): Promise<ActionResult<StudentDetail>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    const student = await service.getStudent(session.companyId, String(id));
    if (!student) return { success: false, error: 'La alumna no existe' };
    return { success: true, data: student };
  } catch (error) {
    return fail(error);
  }
}

export async function saveStudentAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = studentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    let savedId: string;
    if (id) {
      await service.updateStudent(session.companyId, String(id), parsed.data);
      savedId = String(id);
    } else {
      savedId = (await service.createStudent(session.companyId, parsed.data)).id;
    }
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: id ? 'UPDATE' : 'CREATE', entity: 'AcademyStudent', entityId: savedId });
    revalidate();
    return { success: true, data: { id: savedId }, message: id ? 'Ficha actualizada' : 'Alumna creada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveStudent' });
  }
}

export async function setStudentActiveAction(id: string, isActive: boolean): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:manage');
    companyId = session.companyId;
    await service.setStudentActive(session.companyId, String(id), Boolean(isActive));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademyStudent', entityId: String(id), metadata: { isActive: Boolean(isActive) } });
    revalidate();
    return { success: true, data: null, message: isActive ? 'Alumna reactivada' : 'Alumna dada de baja' };
  } catch (error) {
    return fail(error, companyId, { action: 'setStudentActive' });
  }
}

export async function getAttendanceSheetAction(groupId: string, date: string): Promise<ActionResult<AttendanceSheetRow[]>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    const day = isoDay.safeParse(date);
    if (!day.success) return { success: false, error: 'Fecha inválida' };
    return { success: true, data: await service.getAttendanceSheet(session.companyId, String(groupId), day.data) };
  } catch (error) {
    return fail(error);
  }
}

export async function saveAttendanceAction(input: unknown): Promise<ActionResult<{ saved: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = attendanceSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const result = await service.saveAttendance(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademyAttendance', entityId: parsed.data.groupId, metadata: { date: parsed.data.date, marked: result.saved } });
    revalidate();
    return { success: true, data: result, message: 'Lista guardada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveAttendance' });
  }
}

export async function getPaymentBoardAction(period: string, groupId?: string): Promise<ActionResult<PaymentBoardRow[]>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    const parsed = periodSchema.safeParse(period);
    if (!parsed.success) return { success: false, error: 'Mes inválido' };
    return { success: true, data: await service.getPaymentBoard(session.companyId, parsed.data, groupId || undefined) };
  } catch (error) {
    return fail(error);
  }
}

export async function setMonthPaidAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = monthPaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    await service.setMonthPaid(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: parsed.data.paid ? 'CREATE' : 'DELETE', entity: 'AcademyMonthlyPayment', entityId: parsed.data.studentId, metadata: { period: parsed.data.period, amount: parsed.data.amount ?? null } });
    revalidate();
    return { success: true, data: null, message: parsed.data.paid ? 'Mensualidad marcada como pagada' : 'Pago desmarcado' };
  } catch (error) {
    return fail(error, companyId, { action: 'setMonthPaid' });
  }
}

// ── Inscripción pública ──────────────────────────────────────────────────────

function enrollmentUrl(token: string): string {
  return `${getAppUrl()}/academia/inscripcion/${token}`;
}

/** Idempotente: compartir el link varias veces no invalida uno que ya circula. */
export async function shareEnrollmentLinkAction(): Promise<ActionResult<string>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const token = await enrollment.getOrCreateEnrollmentToken(session.companyId);
    return { success: true, data: enrollmentUrl(token) };
  } catch (error) {
    return fail(error, companyId, { action: 'shareEnrollmentLink' });
  }
}

/** Invalida el link anterior: el que ya circuló deja de funcionar. */
export async function regenerateEnrollmentLinkAction(): Promise<ActionResult<string>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:manage');
    companyId = session.companyId;
    const token = await enrollment.regenerateEnrollmentToken(session.companyId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademyEnrollmentLink', entityId: 'enrollment-link', metadata: { regenerated: true } });
    return { success: true, data: enrollmentUrl(token), message: 'Link nuevo generado: el anterior ya no funciona' };
  } catch (error) {
    return fail(error, companyId, { action: 'regenerateEnrollmentLink' });
  }
}

export async function listApplicationsAction(status: 'PENDING' | 'REVIEWED' = 'PENDING'): Promise<ActionResult<ApplicationRow[]>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    return { success: true, data: await enrollment.listApplications(session.companyId, status === 'REVIEWED' ? 'REVIEWED' : 'PENDING') };
  } catch (error) {
    return fail(error);
  }
}

export async function countPendingApplicationsAction(): Promise<ActionResult<number>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    return { success: true, data: await enrollment.countPendingApplications(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function approveApplicationAction(id: string, input: unknown): Promise<ActionResult<{ studentId: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = approveApplicationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const result = await enrollment.approveApplication(session.companyId, String(id), parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'AcademyStudent', entityId: result.studentId, metadata: { fromApplication: String(id) } });
    revalidate();
    return { success: true, data: result, message: 'Inscripción aprobada: la ficha de la alumna ya está creada' };
  } catch (error) {
    return fail(error, companyId, { action: 'approveApplication' });
  }
}

export async function rejectApplicationAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    await enrollment.rejectApplication(session.companyId, String(id));
    revalidate();
    return { success: true, data: null, message: 'Inscripción rechazada' };
  } catch (error) {
    return fail(error, companyId, { action: 'rejectApplication' });
  }
}

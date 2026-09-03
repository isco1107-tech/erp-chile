'use server';

import { revalidatePath } from 'next/cache';
import type { CandidateSession } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { sessionAttendanceBulkSchema, sessionSeriesCreateSchema } from '../schema';
import * as sessionsService from '../services/sessions.service';
import type { SessionWithRoster } from '../services/sessions.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado';
}

export async function createSessionSeriesAction(input: unknown): Promise<ActionResult<CandidateSession[]>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = sessionSeriesCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await sessionsService.createSessionSeries(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'CandidateSession',
      entityId: parsed.data.projectId,
      metadata: { count: data.length, activityType: parsed.data.activityType, startDate: parsed.data.startDate, endDate: parsed.data.endDate },
    });
    revalidatePath('/dashboard/candidates/attendance');
    return { success: true, data, message: `${data.length} sesión(es) creada(s)` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listSessionsAction(projectId: string): Promise<ActionResult<CandidateSession[]>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await sessionsService.listSessions(session.companyId, projectId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getSessionAction(sessionId: string): Promise<ActionResult<SessionWithRoster>> {
  try {
    const session = await requireAuthWithPermission('candidates:read');
    const data = await sessionsService.getSession(session.companyId, sessionId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteSessionAction(sessionId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    await sessionsService.deleteSession(session.companyId, sessionId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'CandidateSession',
      entityId: sessionId,
    });
    revalidatePath('/dashboard/candidates/attendance');
    return { success: true, data: null, message: 'Sesión eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveSessionAttendanceAction(sessionId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('candidates:write');
    const parsed = sessionAttendanceBulkSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await sessionsService.saveSessionAttendance(session.companyId, sessionId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CandidateSession',
      entityId: sessionId,
      metadata: { entries: parsed.data.entries.length },
    });
    revalidatePath(`/dashboard/candidates/attendance/${sessionId}`);
    return { success: true, data: null, message: 'Asistencia guardada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

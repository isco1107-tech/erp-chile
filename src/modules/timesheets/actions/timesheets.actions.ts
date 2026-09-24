'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage, can, type AuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { billTimeEntriesSchema, timeEntryFilterSchema, timeEntrySchema } from '../schema';
import * as timesheetsService from '../services/timesheets.service';
import type { TimeEntryRow, TimesheetSummary } from '../services/timesheets.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function viewerOf(session: AuthContext): timesheetsService.TimesheetViewer {
  return { userId: session.id, canManage: can(session, 'timesheets:manage') };
}

export interface TimesheetBoard {
  entries: TimeEntryRow[];
  summary: TimesheetSummary;
  lookups: Awaited<ReturnType<typeof timesheetsService.getLookups>>;
  currentUserId: string;
  canManage: boolean;
  /** Facturar horas crea un documento de venta: además de gestionar horas, exige `sales:write`. */
  canBill: boolean;
}

export async function getTimesheetBoardAction(filter: unknown): Promise<ActionResult<TimesheetBoard>> {
  try {
    const session = await requireAuthWithPermission('timesheets:log');
    const parsed = timeEntryFilterSchema.safeParse(filter);
    if (!parsed.success) return { success: false, error: 'Rango de fechas inválido' };
    const viewer = viewerOf(session);
    const [entries, summary, lookups] = await Promise.all([
      timesheetsService.listEntries(session.companyId, viewer, parsed.data),
      timesheetsService.getSummary(session.companyId, viewer, parsed.data),
      timesheetsService.getLookups(session.companyId, viewer, session.features.hasEventProjects),
    ]);
    return {
      success: true,
      data: { entries, summary, lookups, currentUserId: session.id, canManage: viewer.canManage, canBill: viewer.canManage && can(session, 'sales:write') },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveTimeEntryAction(id: string | null, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('timesheets:log');
    const parsed = timeEntrySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const viewer = viewerOf(session);
    if (id) await timesheetsService.updateEntry(session.companyId, viewer, id, parsed.data);
    else await timesheetsService.createEntry(session.companyId, viewer, parsed.data);
    revalidatePath('/dashboard/timesheets');
    return { success: true, data: null, message: id ? 'Registro actualizado' : 'Horas registradas' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteTimeEntryAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('timesheets:log');
    await timesheetsService.deleteEntry(session.companyId, viewerOf(session), id);
    revalidatePath('/dashboard/timesheets');
    return { success: true, data: null, message: 'Registro eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function billTimeEntriesAction(input: unknown): Promise<ActionResult<{ salesDocumentId: string }>> {
  try {
    const session = await requireAuthWithPermission('timesheets:manage');
    if (!can(session, 'sales:write')) return { success: false, error: 'Necesitas permiso para crear ventas para facturar horas' };
    const parsed = billTimeEntriesSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const result = await timesheetsService.billEntries(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SalesDocument',
      entityId: result.salesDocumentId,
      metadata: { origin: 'timesheets', entries: parsed.data.entryIds.length, minutes: result.minutes, amount: result.amount },
    });
    revalidatePath('/dashboard/timesheets');
    revalidatePath('/dashboard/sales');
    return { success: true, data: { salesDocumentId: result.salesDocumentId }, message: 'Borrador de factura creado: revísalo y emítelo' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

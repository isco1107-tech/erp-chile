'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { isIsoDay } from '@/lib/academy/calendar';
import { calendarRangeSchema, materialLinkSchema, sessionScopeSchema, sessionSchema, sessionUpdateSchema } from '../schema';
import { AcademyError } from '../services/academy.service';
import * as calendar from '../services/academy-calendar.service';
import * as materials from '../services/academy-material.service';
import type { ActionResult } from './academy.actions';

/**
 * Calendario de clases y material de la academia. Mismas reglas que el resto
 * del módulo: cada acción empieza por el permiso, el `companyId` sale de la
 * sesión y el mensaje de error que ve la persona es accionable y en español.
 */

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof AcademyError) return { success: false, error: error.message };
  captureException(error, { module: 'academia', companyId, extra });
  return { success: false, error: 'No se pudo completar la operación. Intenta de nuevo' };
}

const firstIssue = (issues: Array<{ message: string }>) => issues[0]?.message ?? 'Datos inválidos';

function revalidate(): void {
  revalidatePath('/dashboard/academy');
}

const id = (value: unknown): string => String(value ?? '').slice(0, 64);

// ── Calendario ───────────────────────────────────────────────────────────────

export async function getCalendarAction(range: unknown): Promise<ActionResult<calendar.SessionRow[]>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    const parsed = calendarRangeSchema.safeParse(range);
    if (!parsed.success) return { success: false, error: 'Rango de fechas inválido' };
    return { success: true, data: await calendar.listSessions(session.companyId, parsed.data.from, parsed.data.to) };
  } catch (error) {
    return fail(error);
  }
}

/** `today` es el día de quien mira (su zona horaria), no el del servidor. */
export async function getCalendarSummaryAction(today: string): Promise<ActionResult<calendar.CalendarSummary>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    if (typeof today !== 'string' || !isIsoDay(today)) return { success: false, error: 'Fecha inválida' };
    return { success: true, data: await calendar.getCalendarSummary(session.companyId, today) };
  } catch (error) {
    return fail(error);
  }
}

export async function getSessionAction(sessionId: string): Promise<ActionResult<calendar.SessionRow>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    const row = await calendar.getSessionRow(session.companyId, id(sessionId));
    if (!row) return { success: false, error: 'La clase no existe' };
    return { success: true, data: row };
  } catch (error) {
    return fail(error);
  }
}

export async function createSessionsAction(input: unknown): Promise<ActionResult<calendar.CreateSessionsResult>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = sessionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const result = await calendar.createSessions(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'AcademySession',
      entityId: result.firstSessionId ?? parsed.data.groupId,
      metadata: { groupId: parsed.data.groupId, date: parsed.data.date, created: result.created, skipped: result.skipped },
    });
    revalidate();
    const message =
      result.created === 1 && result.skipped === 0
        ? 'Clase programada'
        : result.skipped > 0
          ? `${result.created} clases programadas. ${result.skipped} ya existían y se dejaron como estaban`
          : `${result.created} clases programadas`;
    return { success: true, data: result, message };
  } catch (error) {
    return fail(error, companyId, { action: 'createSessions' });
  }
}

export async function updateSessionAction(sessionId: string, input: unknown): Promise<ActionResult<{ updated: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = sessionUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const result = await calendar.updateSession(session.companyId, id(sessionId), parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademySession', entityId: id(sessionId), metadata: { date: parsed.data.date, scope: parsed.data.scope, updated: result.updated } });
    revalidate();
    return { success: true, data: result, message: result.updated > 1 ? `${result.updated} clases actualizadas` : 'Clase actualizada' };
  } catch (error) {
    return fail(error, companyId, { action: 'updateSession' });
  }
}

export async function setSessionCancelledAction(sessionId: string, cancelled: boolean): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    await calendar.setSessionCancelled(session.companyId, id(sessionId), cancelled === true);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademySession', entityId: id(sessionId), metadata: { isCancelled: cancelled === true } });
    revalidate();
    return { success: true, data: null, message: cancelled ? 'Clase cancelada' : 'Clase reactivada' };
  } catch (error) {
    return fail(error, companyId, { action: 'setSessionCancelled' });
  }
}

export async function deleteSessionAction(sessionId: string, scope: unknown = 'ONE'): Promise<ActionResult<{ deleted: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsedScope = sessionScopeSchema.safeParse(scope);
    if (!parsedScope.success) return { success: false, error: 'Alcance inválido' };
    const result = await calendar.deleteSession(session.companyId, id(sessionId), parsedScope.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'AcademySession', entityId: id(sessionId), metadata: { scope: parsedScope.data, deleted: result.deleted } });
    revalidate();
    return { success: true, data: result, message: result.deleted > 1 ? `${result.deleted} clases eliminadas` : 'Clase eliminada' };
  } catch (error) {
    return fail(error, companyId, { action: 'deleteSession' });
  }
}

// ── Material ─────────────────────────────────────────────────────────────────

export async function listMaterialsAction(filter: { groupId?: string; sessionId?: string } = {}): Promise<ActionResult<materials.MaterialRow[]>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    return {
      success: true,
      data: await materials.listMaterials(session.companyId, {
        groupId: typeof filter.groupId === 'string' && filter.groupId ? filter.groupId.slice(0, 64) : undefined,
        sessionId: typeof filter.sessionId === 'string' && filter.sessionId ? filter.sessionId.slice(0, 64) : undefined,
      }),
    };
  } catch (error) {
    return fail(error);
  }
}

/** A cuántos correos llegaría el material de un grupo y qué alumnas no tienen ninguno. */
export async function getMaterialRecipientsAction(groupId: string): Promise<ActionResult<materials.MaterialRecipients>> {
  try {
    const session = await requireAuthWithPermission('academy:read');
    return { success: true, data: await materials.getRecipients(session.companyId, id(groupId)) };
  } catch (error) {
    return fail(error);
  }
}

export interface LinkMaterialResult {
  material: materials.MaterialRow;
  send: materials.SendMaterialResult | null;
  /** Si pidió enviarlo y el envío falló, el motivo (el material sí quedó guardado). */
  sendError: string | null;
}

export async function addMaterialLinkAction(input: unknown): Promise<ActionResult<LinkMaterialResult>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = materialLinkSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const material = await materials.createLinkMaterial(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'AcademyMaterial', entityId: material.id, metadata: { kind: 'LINK', groupId: material.groupId, sessionId: material.sessionId } });

    let send: materials.SendMaterialResult | null = null;
    let sendError: string | null = null;
    if (parsed.data.send) {
      try {
        send = await materials.sendMaterial(session.companyId, material.id);
        await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademyMaterial', entityId: material.id, metadata: { sent: send.sent, failed: send.failed } });
      } catch (error) {
        const failure = fail(error, companyId, { action: 'sendMaterial' });
        sendError = failure.error;
      }
    }
    revalidate();
    return { success: true, data: { material, send, sendError }, message: 'Enlace guardado' };
  } catch (error) {
    return fail(error, companyId, { action: 'addMaterialLink' });
  }
}

export async function sendMaterialAction(materialId: string): Promise<ActionResult<materials.SendMaterialResult>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const result = await materials.sendMaterial(session.companyId, id(materialId));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'AcademyMaterial', entityId: id(materialId), metadata: { sent: result.sent, failed: result.failed } });
    revalidate();
    return { success: true, data: result, message: `Material enviado a ${result.sent} ${result.sent === 1 ? 'correo' : 'correos'}` };
  } catch (error) {
    return fail(error, companyId, { action: 'sendMaterial' });
  }
}

export async function deleteMaterialAction(materialId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    await materials.deleteMaterial(session.companyId, id(materialId));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'AcademyMaterial', entityId: id(materialId) });
    revalidate();
    return { success: true, data: null, message: 'Material eliminado' };
  } catch (error) {
    return fail(error, companyId, { action: 'deleteMaterial' });
  }
}

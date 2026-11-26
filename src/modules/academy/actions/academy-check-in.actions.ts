'use server';

import QRCode from 'qrcode';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { getAppUrl } from '@/lib/email/mailer';
import { checkInLateSchema, checkInOpenSchema, checkInTargetSchema } from '../schema';
import { AcademyError } from '../services/academy.service';
import * as checkIn from '../services/academy-check-in.service';
import type { CheckInState } from '@/lib/academy/check-in';
import type { ActionResult } from './academy.actions';

/**
 * Registro de asistencia con QR desde «Pasar lista». Ver el QR equivale a
 * poder marcar asistencia, así que todo exige `academy:write` (lo mismo que
 * guardar la lista). El `companyId` sale de la sesión.
 */

export interface CheckInPanelView {
  url: string;
  /** PNG del QR como data URL, generado en el servidor. */
  qrDataUrl: string;
  /** ISO. */
  expiresAt: string;
  /** "HH:MM" desde la que cuenta como atraso; `null` = nunca. */
  lateAfter: string | null;
  state: CheckInState;
}

export interface CheckInPanelState {
  /** `null` si el QR de esta clase nunca se abrió. */
  view: CheckInPanelView | null;
  /** Hora de inicio de la clase del calendario: se ofrece como hora de atraso. */
  classStartTime: string | null;
}

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof AcademyError) return { success: false, error: error.message };
  captureException(error, { module: 'academia', companyId, extra });
  return { success: false, error: 'No se pudo completar la operación. Intenta de nuevo' };
}

const firstIssue = (issues: Array<{ message: string }>) => issues[0]?.message ?? 'Datos inválidos';

async function toPanelView(link: checkIn.CheckInLinkView): Promise<CheckInPanelView> {
  const url = `${getAppUrl()}/academia/asistencia/${link.token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M' });
  return { url, qrDataUrl, expiresAt: link.expiresAt.toISOString(), lateAfter: link.lateAfter, state: link.state };
}

/** El QR de la clase, si ya se abrió (para volver a mostrarlo al recargar), y la hora de inicio de la clase. */
export async function getCheckInAction(input: unknown): Promise<ActionResult<CheckInPanelState>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = checkInTargetSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const [link, classStartTime] = await Promise.all([
      checkIn.getCheckInLink(session.companyId, parsed.data.groupId, parsed.data.date),
      checkIn.getClassStartTime(session.companyId, parsed.data.groupId, parsed.data.date),
    ]);
    return { success: true, data: { view: link ? await toPanelView(link) : null, classStartTime } };
  } catch (error) {
    return fail(error, companyId, { action: 'getCheckIn' });
  }
}

export async function openCheckInAction(input: unknown): Promise<ActionResult<CheckInPanelView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = checkInOpenSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const link = await checkIn.openCheckIn(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'AcademyCheckInLink',
      entityId: parsed.data.groupId,
      metadata: { date: parsed.data.date, minutes: parsed.data.minutes, renewed: parsed.data.renew, lateAfter: parsed.data.lateAfter },
    });
    return { success: true, data: await toPanelView(link), message: parsed.data.renew ? 'QR nuevo: el anterior ya no funciona' : 'Registro con QR abierto' };
  } catch (error) {
    return fail(error, companyId, { action: 'openCheckIn' });
  }
}

/** Cambia la hora desde la que el QR marca «Atrasada» (vale para lo que se escanee desde ahora). */
export async function setCheckInLateAfterAction(input: unknown): Promise<ActionResult<CheckInPanelView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = checkInLateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const link = await checkIn.setCheckInLateAfter(session.companyId, parsed.data.groupId, parsed.data.date, parsed.data.lateAfter);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'AcademyCheckInLink',
      entityId: parsed.data.groupId,
      metadata: { date: parsed.data.date, lateAfter: parsed.data.lateAfter },
    });
    return {
      success: true,
      data: await toPanelView(link),
      message: parsed.data.lateAfter ? `Desde las ${parsed.data.lateAfter} quedan como atrasadas` : 'Sin hora de atraso: todas quedan presentes',
    };
  } catch (error) {
    return fail(error, companyId, { action: 'setCheckInLateAfter' });
  }
}

export async function closeCheckInAction(input: unknown): Promise<ActionResult<CheckInPanelView | null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('academy:write');
    companyId = session.companyId;
    const parsed = checkInTargetSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error.issues) };
    const link = await checkIn.closeCheckIn(session.companyId, parsed.data.groupId, parsed.data.date);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'AcademyCheckInLink',
      entityId: parsed.data.groupId,
      metadata: { date: parsed.data.date, closed: true },
    });
    return { success: true, data: link ? await toPanelView(link) : null, message: 'Registro con QR cerrado' };
  } catch (error) {
    return fail(error, companyId, { action: 'closeCheckIn' });
  }
}

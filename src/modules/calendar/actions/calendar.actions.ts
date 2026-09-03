'use server';

import { headers } from 'next/headers';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import * as calendarService from '../services/calendar.service';
import * as remindersService from '../services/event-reminders.service';
import type { CalendarFeedData } from '../schema';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Error) return error.message;
  return toFriendlyErrorMessage(error);
}

async function getOriginUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Obtiene todos los eventos de certamen, pauta y cumpleaños para el panel y Google Calendar. */
export async function getCalendarDataAction(): Promise<ActionResult<CalendarFeedData>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    const origin = await getOriginUrl();
    const data = await calendarService.getCalendarData(session.companyId, origin);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Regenera el token de sincronización de Google Calendar (invalidando URLs previas). */
export async function regenerateCalendarSyncTokenAction(): Promise<ActionResult<string>> {
  try {
    const session = await requireAuthWithPermission('projects:write');
    const token = await calendarService.regenerateCalendarSyncToken(session.companyId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: session.companyId,
      metadata: { reason: 'calendar_token_regenerated' },
    });
    return { success: true, data: token, message: 'Enlace de Google Calendar regenerado exitosamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Envía inmediatamente un recordatorio por correo al administrador sobre actividades y cumpleaños. */
export async function sendRemindersNowAction(targetEmailOverride?: string): Promise<ActionResult<{ recipient: string; eventsCount: number; birthdaysCount: number }>> {
  try {
    const session = await requireAuthWithPermission('projects:read');
    const origin = await getOriginUrl();
    const result = await remindersService.sendUpcomingEventsReminder(session.companyId, origin, targetEmailOverride);
    if (!result.sent) {
      return { success: false, error: result.message };
    }
    return {
      success: true,
      data: {
        recipient: result.recipient,
        eventsCount: result.eventsCount,
        birthdaysCount: result.birthdaysCount,
      },
      message: result.message,
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

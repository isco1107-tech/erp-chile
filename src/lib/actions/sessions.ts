'use server';

import { cookies } from 'next/headers';
import { getAuthContext, authErrorMessage } from '@/lib/auth/guards';
import { hashSessionToken } from '@/lib/auth/sessions';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';
import * as sessionsService from '@/lib/services/sessions.service';
import type { SessionWithUser } from '@/lib/services/sessions.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export interface MySessionsResult {
  sessions: SessionWithUser[];
  currentSessionId: string | null;
  viewerUserId: string;
  /** 'company' cuando el rol es OWNER/ADMIN: ve todas las sesiones activas de la empresa, no solo las propias. */
  scope: 'own' | 'company';
}

const COMPANY_WIDE_ROLES = new Set(['OWNER', 'ADMIN']);

/** "Dispositivos activos": rol base OWNER/ADMIN ve toda la empresa, cualquier otro rol solo ve las propias. */
export async function listMySessionsAction(): Promise<ActionResult<MySessionsResult>> {
  try {
    const context = await getAuthContext();
    const scope: 'own' | 'company' = COMPANY_WIDE_ROLES.has(context.role) ? 'company' : 'own';
    const sessions = await sessionsService.listSessionsForViewer(context.companyId, context.id, scope);

    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    const currentHash = token ? hashSessionToken(token) : null;
    // El hash no viaja al cliente: se resuelve acá adentro a un id de sesión,
    // que sí es seguro de mostrar, solo para marcar "Este dispositivo".
    const currentSessionId = currentHash
      ? ((await prisma.userSession.findUnique({ where: { tokenHash: currentHash }, select: { id: true } }))?.id ?? null)
      : null;

    return { success: true, data: { sessions, currentSessionId, viewerUserId: context.id, scope } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function revokeMySessionAction(sessionId: string): Promise<ActionResult<null>> {
  try {
    const context = await getAuthContext();
    await sessionsService.revokeSession(context.id, sessionId);
    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'UserSession',
      entityId: sessionId,
      metadata: { reason: 'user_revoked_device' },
    });
    return { success: true, data: null, message: 'Sesión cerrada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<null>> {
  try {
    const context = await getAuthContext();
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return { success: false, error: 'Sesión inválida' };

    const count = await sessionsService.revokeOtherSessions(context.id, hashSessionToken(token));
    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'UPDATE',
      entity: 'UserSession',
      entityId: 'bulk',
      metadata: { reason: 'user_revoked_other_devices', count },
    });
    return { success: true, data: null, message: count > 0 ? `${count} sesión(es) cerrada(s)` : 'No había otras sesiones activas' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

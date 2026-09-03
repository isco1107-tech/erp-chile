import { prisma } from '@/lib/prisma';
import type { UserSession } from '@prisma/client';

/** Nunca se manda el hash del token al cliente: no revierte a la sesión real, pero no hace falta exponerlo. */
export type SafeSession = Omit<UserSession, 'tokenHash'>;
export type SessionWithUser = SafeSession & { user: { name: string; email: string } };
const SAFE_SESSION_OMIT = { tokenHash: true } as const;

/**
 * OWNER y ADMIN ven las sesiones activas de toda la empresa (para detectar un
 * dispositivo ajeno sospechoso); cualquier otro rol solo ve las propias. La
 * decisión de qué alcance aplica vive en el caller (conoce el rol), no acá.
 */
export async function listSessionsForViewer(
  companyId: string,
  userId: string,
  scope: 'own' | 'company'
): Promise<SessionWithUser[]> {
  return prisma.userSession.findMany({
    where: {
      companyId,
      ...(scope === 'own' ? { userId } : {}),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: 'desc' },
    omit: SAFE_SESSION_OMIT,
    include: { user: { select: { name: true, email: true } } },
  });
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const result = await prisma.userSession.updateMany({
    where: { id: sessionId, userId },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new Error('Sesión no encontrada');
}

/** Cierra todas las sesiones activas del usuario salvo la actual (identificada por su hash). */
export async function revokeOtherSessions(userId: string, keepTokenHash: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null, tokenHash: { not: keepTokenHash } },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

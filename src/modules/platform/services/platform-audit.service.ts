import 'server-only';

import type { PlatformAuditLog } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Historial de acciones destructivas de plataforma (hoy: borrado permanente
 * de tenants). Vive fuera del ciclo de vida de cualquier empresa — ver
 * comentario del modelo `PlatformAuditLog` en schema.prisma.
 */
export async function listPlatformAuditLog(limit = 200): Promise<PlatformAuditLog[]> {
  return prisma.platformAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

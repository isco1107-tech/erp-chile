import { prisma } from '@/lib/prisma';
import type { AuditAction, AuditLog } from '@prisma/client';

export interface AuditLogFilters {
  action?: AuditAction;
  entity?: string;
  query?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditLogs(companyId: string, filters?: AuditLogFilters, take = 300): Promise<AuditLog[]> {
  const where: Record<string, unknown> = { companyId };
  if (filters?.action) where.action = filters.action;
  if (filters?.entity) where.entity = filters.entity;
  const trimmed = filters?.query?.trim();
  if (trimmed) {
    where.OR = [
      { userEmail: { contains: trimmed, mode: 'insensitive' } },
      { entity: { contains: trimmed, mode: 'insensitive' } },
      { entityId: { contains: trimmed, mode: 'insensitive' } },
    ];
  }
  if (filters?.from || filters?.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    // Tope alto pero explícito para exportar rangos largos sin arriesgar una
    // consulta descontrolada — la vista en pantalla sigue usando el default
    // de 300 filas.
    take,
  });
}

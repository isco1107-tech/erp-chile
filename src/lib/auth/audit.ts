import 'server-only';

import { headers } from 'next/headers';
import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';

/**
 * Escritura de la bitácora de auditoría.
 *
 * Vive separado de `permissions.ts` a propósito: la matriz de permisos y sus
 * etiquetas las consumen componentes de cliente (el constructor de roles, el
 * panel de módulos), y tener a Prisma en el mismo archivo arrastraba el driver
 * de Postgres al bundle del navegador. `server-only` deja el error en el import
 * en vez de en un stack trace de webpack.
 */

export async function getRequestIp(): Promise<string | undefined> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0]?.trim();
    return headerList.get('x-real-ip') ?? undefined;
  } catch {
    return undefined;
  }
}

export interface CreateAuditLogInput {
  companyId: string;
  userId?: string;
  userEmail: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Registra un evento de auditoría. Nunca debe interrumpir la operación de negocio
 * que la origina: los fallos de escritura se registran en consola y se descartan.
 */
export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  try {
    const ipAddress = input.ipAddress ?? (await getRequestIp());
    // Normaliza a JSON puro: descarta `undefined` y serializa Date/Decimal, que
    // Prisma rechaza en columnas Json. Los metadatos provienen de objetos Zod
    // parseados, donde los campos opcionales pueden venir como `undefined`.
    const metadata: Prisma.InputJsonValue = JSON.parse(JSON.stringify(input.metadata ?? {}));
    await prisma.auditLog.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        userEmail: input.userEmail,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        metadata,
        ipAddress,
      },
    });
  } catch (error) {
    captureException(error, { module: 'auth', companyId: input.companyId, userId: input.userId, extra: { reason: 'createAuditLog', entity: input.entity } });
  }
}

interface CreatePlatformAuditLogInput {
  action: string;
  /** Snapshots de texto plano tomados ANTES del borrado — ver comentario del modelo en schema.prisma. */
  companyId: string;
  companyRut: string;
  companyBusinessName: string;
  performedByUserId: string;
  performedByEmail: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Bitácora de plataforma (superadmin), independiente del ciclo de vida de
 * cualquier tenant — a diferencia de `createAuditLog`, esto debe seguir
 * funcionando aun cuando la empresa referenciada ya no exista (caso de uso:
 * registrar que un tenant fue eliminado permanentemente). Mismo criterio que
 * `createAuditLog`: nunca debe interrumpir la operación de negocio que la
 * origina, los fallos de escritura se registran en consola y se descartan.
 */
export async function createPlatformAuditLog(input: CreatePlatformAuditLogInput): Promise<void> {
  try {
    const ipAddress = input.ipAddress ?? (await getRequestIp());
    const metadata: Prisma.InputJsonValue = JSON.parse(JSON.stringify(input.metadata ?? {}));
    await prisma.platformAuditLog.create({
      data: {
        action: input.action,
        companyId: input.companyId,
        companyRut: input.companyRut,
        companyBusinessName: input.companyBusinessName,
        performedByUserId: input.performedByUserId,
        performedByEmail: input.performedByEmail,
        metadata,
        ipAddress,
      },
    });
  } catch (error) {
    captureException(error, { module: 'platform', companyId: input.companyId, extra: { reason: 'createPlatformAuditLog', action: input.action } });
  }
}

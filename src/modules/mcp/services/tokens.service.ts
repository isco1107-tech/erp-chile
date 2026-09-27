import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { toFeatureFlags, type CompanyFeatureFlags } from '@/lib/auth/modules';
import { resolvePermissions } from '@/lib/auth/effective-permissions';
import { isOperationalTenant } from '@/lib/auth/tenant-status';
import type { Permission } from '@/lib/auth/permissions';

/**
 * Tokens personales del conector MCP (`/api/mcp`) — el mecanismo con el que
 * alguien conecta su Claude o ChatGPT PERSONAL al ERP. Mismo criterio de
 * seguridad que `employee-portal.service.ts`/`PasswordResetToken`: solo se
 * guarda el hash SHA-256, el token en claro se muestra una sola vez al
 * crearlo y no se puede recuperar después.
 *
 * `resolveMcpSession` es la ÚNICA función que valida un token — la usan tanto
 * la puerta de entrada del servidor MCP (`withMcpAuth`) como cada tool en
 * cada llamada (nunca se cachea el resultado entre llamadas): mismo espíritu
 * que `getAuthContext()`, que relee la base en cada request para que
 * desactivar el conector o suspender a alguien corte el acceso de inmediato,
 * sin tener que tocar ni revocar el token.
 */

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface McpSession {
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  permissions: Permission[];
  features: CompanyFeatureFlags;
}

export async function resolveMcpSession(rawToken: string): Promise<McpSession | null> {
  const record = await prisma.mcpPersonalToken.findUnique({
    where: { tokenHash: hashMcpToken(rawToken) },
    include: {
      user: { select: { id: true, name: true, isActive: true, role: true, customRole: { select: { permissions: true } } } },
      company: { include: { features: true, settings: { select: { mcpConnectorEnabled: true } } } },
    },
  });
  if (!record || record.revokedAt) return null;
  if (!record.user.isActive) return null;
  if (!record.company.settings?.mcpConnectorEnabled) return null;
  if (!isOperationalTenant(record.company.status)) return null;

  // Fire-and-forget: no bloquea la respuesta ni la falla si la escritura demora.
  prisma.mcpPersonalToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const features = toFeatureFlags(record.company.features);
  return {
    companyId: record.companyId,
    companyName: record.company.businessName,
    userId: record.userId,
    userName: record.user.name,
    features,
    permissions: resolvePermissions({
      role: record.user.role,
      customRolePermissions: record.user.customRole?.permissions ?? null,
      features,
    }),
  };
}

export interface McpTokenSummary {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function listPersonalTokens(companyId: string, userId: string): Promise<McpTokenSummary[]> {
  return prisma.mcpPersonalToken.findMany({
    where: { companyId, userId, revokedAt: null },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

const MAX_TOKENS_PER_USER = 5;

/** Lanza si ya hay demasiados tokens activos (no es un límite de seguridad estricto, solo evita una lista infinita por descuido). */
export class TooManyTokensError extends Error {}

export async function createPersonalToken(companyId: string, userId: string, name: string): Promise<{ id: string; token: string }> {
  const activeCount = await prisma.mcpPersonalToken.count({ where: { companyId, userId, revokedAt: null } });
  if (activeCount >= MAX_TOKENS_PER_USER) {
    throw new TooManyTokensError(`Ya tienes ${MAX_TOKENS_PER_USER} conectores activos: revoca uno antes de crear otro`);
  }

  const token = `aether_mcp_${randomBytes(32).toString('base64url')}`;
  try {
    const created = await prisma.mcpPersonalToken.create({
      data: { companyId, userId, name, tokenHash: hashMcpToken(token) },
      select: { id: true },
    });
    return { id: created.id, token };
  } catch (error) {
    // Colisión de hash: astronómicamente improbable (32 bytes aleatorios), pero si pasara, un reintento genera uno nuevo.
    if (isUniqueConstraintError(error)) throw new Error('No se pudo generar el token: intenta de nuevo');
    throw error;
  }
}

export async function revokePersonalToken(companyId: string, userId: string, tokenId: string): Promise<void> {
  const result = await prisma.mcpPersonalToken.updateMany({
    where: { id: tokenId, companyId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw new Error('El token no existe o ya estaba revocado');
}

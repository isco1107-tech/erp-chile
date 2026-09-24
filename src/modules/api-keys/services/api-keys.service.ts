import 'server-only';

import type { ApiKey } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateApiKey, isApiScope, type ApiScope } from '@/lib/api/api-keys';

const MAX_ACTIVE_KEYS = 20;

export type ApiKeyRow = Pick<ApiKey, 'id' | 'name' | 'prefix' | 'scopes' | 'lastUsedAt' | 'revokedAt' | 'createdAt'>;

export async function listApiKeys(companyId: string): Promise<ApiKeyRow[]> {
  return prisma.apiKey.findMany({
    where: { companyId },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
  });
}

/** Crea una llave y devuelve el texto plano UNA sola vez: en la base solo queda el hash. */
export async function createApiKey(companyId: string, name: string, scopes: ApiScope[], userId: string): Promise<{ key: ApiKeyRow; plaintext: string }> {
  const validScopes = [...new Set(scopes.filter(isApiScope))];
  if (validScopes.length === 0) throw new Error('Elige al menos un permiso para la llave');
  const active = await prisma.apiKey.count({ where: { companyId, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS) throw new Error(`Máximo ${MAX_ACTIVE_KEYS} llaves activas: revoca las que ya no uses`);

  const { plaintext, prefix, hash } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: { companyId, name, prefix, keyHash: hash, scopes: validScopes, createdByUserId: userId },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
  return { key, plaintext };
}

export async function revokeApiKey(companyId: string, id: string): Promise<void> {
  const result = await prisma.apiKey.updateMany({ where: { id, companyId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) throw new Error('La llave no existe o ya estaba revocada');
}

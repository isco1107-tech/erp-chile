'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { API_SCOPE_KEYS, type ApiScope } from '@/lib/api/api-keys';
import * as apiKeysService from '../services/api-keys.service';
import type { ApiKeyRow } from '../services/api-keys.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

const createSchema = z.object({
  name: z.string().trim().min(2, 'Ponle un nombre (ej. "Tienda Shopify")').max(80),
  scopes: z.array(z.enum(API_SCOPE_KEYS as [ApiScope, ...ApiScope[]])).min(1, 'Elige al menos un permiso'),
});

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

export async function listApiKeysAction(): Promise<ActionResult<ApiKeyRow[]>> {
  try {
    const session = await requireAuthWithPermission('api:manage');
    return { success: true, data: await apiKeysService.listApiKeys(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Devuelve la llave en texto plano UNA vez: no se puede volver a consultar. */
export async function createApiKeyAction(input: unknown): Promise<ActionResult<{ plaintext: string }>> {
  try {
    const session = await requireAuthWithPermission('api:manage');
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const { key, plaintext } = await apiKeysService.createApiKey(session.companyId, parsed.data.name, parsed.data.scopes, session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'ApiKey',
      entityId: key.id,
      metadata: { name: key.name, prefix: key.prefix, scopes: key.scopes },
    });
    revalidatePath('/dashboard/settings/api');
    return { success: true, data: { plaintext }, message: 'Llave creada: cópiala ahora, no se vuelve a mostrar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('api:manage');
    await apiKeysService.revokeApiKey(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ApiKey', entityId: id, metadata: { revoked: true } });
    revalidatePath('/dashboard/settings/api');
    return { success: true, data: null, message: 'Llave revocada: deja de funcionar de inmediato' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import * as n8nSecretService from '../services/n8n-secret.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? (error instanceof Error ? error.message : 'Error inesperado');
}

/** Devuelve el token vigente si ya existe, sin generarlo — la UI decide si
 * mostrar "Generar" o "Copiar / Regenerar" según si `data` es `null`. */
export async function getN8nWebhookSecretAction(): Promise<ActionResult<string | null>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const settings = await prisma.companySettings.findUnique({ where: { companyId: session.companyId }, select: { n8nWebhookSecret: true } });
    return { success: true, data: settings?.n8nWebhookSecret ?? null };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function generateN8nWebhookSecretAction(): Promise<ActionResult<string>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const token = await n8nSecretService.ensureN8nWebhookSecret(session.companyId);
    await createAuditLog({ companyId: session.companyId, userEmail: session.email, action: 'UPDATE', entity: 'CompanySettings', entityId: session.companyId, metadata: { field: 'n8nWebhookSecret', op: 'generate' } });
    revalidatePath('/dashboard/settings/company');
    return { success: true, data: token, message: 'Token generado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function regenerateN8nWebhookSecretAction(): Promise<ActionResult<string>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const token = await n8nSecretService.regenerateN8nWebhookSecret(session.companyId);
    await createAuditLog({ companyId: session.companyId, userEmail: session.email, action: 'UPDATE', entity: 'CompanySettings', entityId: session.companyId, metadata: { field: 'n8nWebhookSecret', op: 'regenerate' } });
    revalidatePath('/dashboard/settings/company');
    return { success: true, data: token, message: 'Token regenerado: el anterior dejó de funcionar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function revokeN8nWebhookSecretAction(): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    await n8nSecretService.revokeN8nWebhookSecret(session.companyId);
    await createAuditLog({ companyId: session.companyId, userEmail: session.email, action: 'UPDATE', entity: 'CompanySettings', entityId: session.companyId, metadata: { field: 'n8nWebhookSecret', op: 'revoke' } });
    revalidatePath('/dashboard/settings/company');
    return { success: true, data: null, message: 'Automatización desactivada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

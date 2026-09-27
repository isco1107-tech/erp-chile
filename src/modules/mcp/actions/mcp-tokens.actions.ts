'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAuthContext, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';
import * as tokens from '../services/tokens.service';
import type { McpTokenSummary } from '../services/tokens.service';

/**
 * Autoservicio: cualquier usuario de la empresa administra SUS PROPIOS
 * tokens del conector MCP, sin permiso especial — mismo criterio que 2FA o
 * el teléfono de "Mi Perfil". La única puerta es que la empresa haya
 * activado `mcpConnectorEnabled` (ver `mcp-settings.actions.ts`).
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof tokens.TooManyTokensError) return error.message;
  return toFriendlyErrorMessage(error);
}

async function assertConnectorEnabled(companyId: string): Promise<void> {
  const settings = await prisma.companySettings.findUnique({ where: { companyId }, select: { mcpConnectorEnabled: true } });
  if (!settings?.mcpConnectorEnabled) {
    throw new Error('Tu empresa no ha activado el conector MCP — pídeselo al Dueño o a un Administrador en Configuración → Empresa');
  }
}

export async function listMcpTokensAction(): Promise<ActionResult<McpTokenSummary[]>> {
  try {
    const context = await getAuthContext();
    return { success: true, data: await tokens.listPersonalTokens(context.companyId, context.id) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const createSchema = z.object({ name: z.string().trim().min(1, 'Ponle un nombre para reconocerlo').max(60) });

export async function createMcpTokenAction(input: unknown): Promise<ActionResult<{ id: string; token: string }>> {
  try {
    const context = await getAuthContext();
    await assertConnectorEnabled(context.companyId);
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const created = await tokens.createPersonalToken(context.companyId, context.id, parsed.data.name);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'CREATE',
      entity: 'McpPersonalToken',
      entityId: created.id,
      metadata: { name: parsed.data.name },
    });

    revalidatePath('/dashboard/settings/profile');
    return { success: true, data: created, message: 'Token creado — cópialo ahora, no se puede volver a mostrar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function revokeMcpTokenAction(tokenId: string): Promise<ActionResult<null>> {
  try {
    const context = await getAuthContext();
    await tokens.revokePersonalToken(context.companyId, context.id, tokenId);

    await createAuditLog({
      companyId: context.companyId,
      userId: context.id,
      userEmail: context.email,
      action: 'DELETE',
      entity: 'McpPersonalToken',
      entityId: tokenId,
    });

    revalidatePath('/dashboard/settings/profile');
    return { success: true, data: null, message: 'Token revocado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

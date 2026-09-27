'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { prisma } from '@/lib/prisma';

/**
 * Interruptor de empresa para el conector MCP (`settings:company`, mismo
 * corte que la lista de IPs permitidas y el webhook de n8n): decide si
 * cualquier usuario de la empresa puede generarse un token personal. Apagado
 * por defecto — activarlo es una decisión del dueño/administrador, no algo
 * que un vendedor pueda prender por su cuenta.
 */

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  return toFriendlyErrorMessage(error);
}

export async function getMcpConnectorSettingsAction(): Promise<ActionResult<{ enabled: boolean }>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const settings = await prisma.companySettings.findUnique({
      where: { companyId: session.companyId },
      select: { mcpConnectorEnabled: true },
    });
    return { success: true, data: { enabled: settings?.mcpConnectorEnabled ?? false } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const toggleSchema = z.object({ enabled: z.boolean() });

export async function updateMcpConnectorEnabledAction(input: unknown): Promise<ActionResult<{ enabled: boolean }>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const parsed = toggleSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };

    const settings = await prisma.companySettings.update({
      where: { companyId: session.companyId },
      data: { mcpConnectorEnabled: parsed.data.enabled },
      select: { id: true, mcpConnectorEnabled: true },
    });

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: settings.id,
      metadata: { reason: 'mcp_connector_toggled', enabled: parsed.data.enabled },
    });

    revalidatePath('/dashboard/settings/company');
    revalidatePath('/dashboard/settings/profile');
    return {
      success: true,
      data: { enabled: settings.mcpConnectorEnabled },
      message: parsed.data.enabled ? 'Conector MCP activado' : 'Conector MCP desactivado — los tokens ya generados dejan de funcionar de inmediato',
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

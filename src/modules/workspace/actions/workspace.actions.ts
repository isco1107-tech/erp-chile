'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { getDisabledNavItems, setDisabledNavItems } from '../services/workspace.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

const disabledNavItemsSchema = z.object({
  disabledNavItems: z.array(z.string().min(1).max(64)).max(200),
});

/**
 * Guarda qué ítems del menú lateral quedan apagados para TODA la empresa.
 * Mismo permiso que editar los datos de la empresa: es configuración del
 * espacio de trabajo, no algo que cada colaborador decida por su cuenta.
 */
export async function updateDisabledNavItemsAction(input: unknown): Promise<ActionResult<string[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = disabledNavItemsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'La selección de módulos no es válida' };

    const before = await getDisabledNavItems(session.companyId);
    const saved = await setDisabledNavItems(session.companyId, parsed.data.disabledNavItems);

    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'WorkspaceNavigation',
      entityId: session.companyId,
      metadata: {
        disabled: saved.filter((id) => !before.includes(id)),
        enabled: before.filter((id) => !saved.includes(id)),
      },
    });

    // El menú vive en el layout del dashboard: hay que revalidar el árbol completo.
    revalidatePath('/dashboard', 'layout');
    return { success: true, data: saved, message: 'Menú actualizado' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'workspace', companyId });
    return { success: false, error: 'No se pudo guardar la configuración del menú' };
  }
}

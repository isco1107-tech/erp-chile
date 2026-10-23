'use server';

import { revalidatePath } from 'next/cache';
import { assertModuleEnabled, authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { isDeadStockDays } from '@/lib/retail/dead-stock';
import { deadStockSettingsSchema } from '../schema';
import { saveDeadStockSettings, type RetailSettingsValues } from '../services/retail-settings.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

/** Umbral de stock muerto y si se avisa al cumplirlo. Cambia lo que ve y recibe todo el equipo. */
export async function saveDeadStockSettingsAction(input: unknown): Promise<ActionResult<RetailSettingsValues>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('retail:manage');
    companyId = session.companyId;
    assertModuleEnabled(session, 'hasDeadStock');
    const parsed = deadStockSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const { deadStockDays, deadStockAlerts } = parsed.data;
    // El esquema ya lo validó; esto solo afina el tipo.
    if (!isDeadStockDays(deadStockDays)) return { success: false, error: 'Elige un umbral de la lista' };
    const saved = await saveDeadStockSettings(session.companyId, { deadStockDays, deadStockAlerts });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'RetailSettings',
      entityId: session.companyId,
      metadata: { deadStockDays, deadStockAlerts },
    });
    revalidatePath('/dashboard/retail/stock-muerto');
    return { success: true, data: saved, message: 'Ajustes guardados' };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'retail', companyId, extra: { reason: 'dead-stock-settings' } });
    return { success: false, error: 'No se pudieron guardar los ajustes. Intenta de nuevo' };
  }
}

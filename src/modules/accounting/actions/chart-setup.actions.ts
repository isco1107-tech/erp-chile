'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { ensureChartOfAccounts } from '../services/chart-setup.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

/**
 * Crea el plan de cuentas base para una empresa que ya tiene Contabilidad
 * activa pero todavía sin cuentas (empresas que la tenían encendida antes de
 * que activarla sembrara el plan). Mismo permiso que editar el plan de cuentas.
 */
export async function initializeChartOfAccountsAction(): Promise<ActionResult<{ created: boolean }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('accounting:manage_accounts');
    companyId = session.companyId;
    const result = await ensureChartOfAccounts(session.companyId);
    if (result.created) {
      await createAuditLog({
        companyId: session.companyId,
        userId: session.id,
        userEmail: session.email,
        action: 'CREATE',
        entity: 'ChartOfAccounts',
        entityId: session.companyId,
        metadata: { origin: 'initialize-button' },
      });
    }
    revalidatePath('/dashboard', 'layout');
    return {
      success: true,
      data: result,
      message: result.created ? 'Plan de cuentas creado: desde ahora cada venta, compra y pago se contabiliza solo' : 'Tu empresa ya tenía plan de cuentas',
    };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'contabilidad', companyId });
    return { success: false, error: 'No se pudo crear el plan de cuentas. Intenta de nuevo en unos minutos.' };
  }
}

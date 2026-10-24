'use server';

import { revalidatePath } from 'next/cache';
import { assertModuleEnabled, authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { applySuggestionsSchema, assignLiabilitySchema, shrinkageSettingsSchema } from '../shrinkage.schema';
import { ShrinkageError, applySuggestions, assignLiability, saveShrinkageSettings } from '../services/shrinkage.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId: string | undefined, reason: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof ShrinkageError) return { success: false, error: error.message };
  captureException(error, { module: 'inventario', companyId, extra: { reason } });
  return { success: false, error: 'No se pudo guardar. Intenta de nuevo' };
}

/** Quién responde por una pérdida (o quitarle el responsable). */
export async function assignLiabilityAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    assertModuleEnabled(session, 'hasShrinkageLiability');
    const parsed = assignLiabilitySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await assignLiability(session.companyId, { id: session.id, name: session.name }, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'ShrinkageLiability',
      entityId: parsed.data.movementId,
      metadata: { party: parsed.data.party, supplierId: parsed.data.party === 'SUPPLIER' ? parsed.data.supplierId : null },
    });
    revalidatePath('/dashboard/inventory/mermas');
    return { success: true, data: null, message: parsed.data.party ? 'Responsable guardado' : 'Quedó sin asignar' };
  } catch (error) {
    return fail(error, companyId, 'assign-liability');
  }
}

/** Confirma las sugerencias de las pérdidas sin asignar de una bodega y período. */
export async function applySuggestionsAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    assertModuleEnabled(session, 'hasShrinkageLiability');
    const parsed = applySuggestionsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };
    const value = parsed.data;
    const count = await applySuggestions(session.companyId, { id: session.id, name: session.name }, value);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ShrinkageLiability', entityId: value.warehouseId, metadata: { applied: count, from: value.from, to: value.to } });
    revalidatePath('/dashboard/inventory/mermas');
    return { success: true, data: { count }, message: count === 1 ? 'Se confirmó 1 responsable' : `Se confirmaron ${count} responsables` };
  } catch (error) {
    return fail(error, companyId, 'apply-suggestions');
  }
}

/** Responsable sugerido por motivo y avisos de vencimiento: política de la empresa. */
export async function saveShrinkageSettingsAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    assertModuleEnabled(session, 'hasShrinkageLiability');
    const parsed = shrinkageSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await saveShrinkageSettings(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ShrinkageSettings', entityId: session.companyId, metadata: parsed.data });
    revalidatePath('/dashboard/inventory/mermas');
    return { success: true, data: null, message: 'Ajustes guardados' };
  } catch (error) {
    return fail(error, companyId, 'shrinkage-settings');
  }
}

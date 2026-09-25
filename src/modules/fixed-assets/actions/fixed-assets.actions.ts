'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage, can, ModuleNotEnabledError } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { JournalError } from '@/modules/accounting/services/journal.service';
import { disposeAssetSchema, fixedAssetSchema, maintenanceSchema, postDepreciationSchema } from '../schema';
import * as assetsService from '../services/fixed-assets.service';
import type { AssetDetail, AssetRow, AssetsSummary, UpcomingMaintenance } from '../services/fixed-assets.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  if (error instanceof JournalError) return error.message;
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? 'Datos inválidos';
}

export async function getFixedAssetsAction(): Promise<ActionResult<{ assets: AssetRow[]; summary: AssetsSummary }>> {
  try {
    const session = await requireAuthWithPermission('assets:read');
    return { success: true, data: await assetsService.listAssets(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveFixedAssetAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('assets:write');
    const parsed = fixedAssetSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const asset = id ? await assetsService.updateAsset(session.companyId, id, parsed.data) : await assetsService.createAsset(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'FixedAsset',
      entityId: asset.id,
      metadata: { code: asset.code, name: asset.name, cost: asset.acquisitionCost, method: asset.method },
    });
    revalidatePath('/dashboard/fixed-assets');
    return { success: true, data: { id: asset.id }, message: id ? 'Activo actualizado' : 'Activo registrado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function disposeFixedAssetAction(id: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('assets:write');
    const parsed = disposeAssetSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    await assetsService.disposeAsset(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'FixedAsset',
      entityId: id,
      metadata: { disposalDate: parsed.data.disposalDate.toISOString(), disposalAmount: parsed.data.disposalAmount },
    });
    revalidatePath('/dashboard/fixed-assets');
    return { success: true, data: null, message: 'Baja registrada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteFixedAssetAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('assets:write');
    await assetsService.deleteAsset(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'FixedAsset', entityId: id });
    revalidatePath('/dashboard/fixed-assets');
    return { success: true, data: null, message: 'Activo eliminado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/**
 * Contabiliza la depreciación del mes en el Libro Diario. Exige además el
 * módulo de Contabilidad y el permiso de asientos manuales: es un asiento real.
 */
export async function postDepreciationAction(input: unknown): Promise<ActionResult<{ amount: number; entryNumber: number }>> {
  try {
    const session = await requireAuthWithPermission('assets:write');
    if (!session.features.hasAccounting) throw new ModuleNotEnabledError('hasAccounting');
    if (!can(session, 'accounting:manual_entry')) return { success: false, error: 'Tu rol no puede crear asientos contables' };
    const parsed = postDepreciationSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    const result = await assetsService.postMonthlyDepreciation(session.companyId, session.id, parsed.data.year, parsed.data.month);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'JournalEntry',
      entityId: assetsService.depreciationSourceId(parsed.data.year, parsed.data.month),
      metadata: { amount: result.amount, entryNumber: result.entryNumber, origin: 'fixed-assets' },
    });
    revalidatePath('/dashboard/fixed-assets');
    revalidatePath('/dashboard/accounting/journal');
    return { success: true, data: result, message: `Asiento N° ${result.entryNumber} contabilizado` };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getFixedAssetAction(id: string): Promise<ActionResult<AssetDetail>> {
  try {
    const session = await requireAuthWithPermission('assets:read');
    const asset = await assetsService.getAsset(session.companyId, id);
    if (!asset) return { success: false, error: 'El activo no existe' };
    return { success: true, data: asset };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listUpcomingMaintenancesAction(): Promise<ActionResult<UpcomingMaintenance[]>> {
  try {
    const session = await requireAuthWithPermission('assets:read');
    return { success: true, data: await assetsService.upcomingMaintenances(session.companyId) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function addMaintenanceAction(assetId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('assets:write');
    const parsed = maintenanceSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
    await assetsService.addMaintenance(session.companyId, assetId, session.name, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'FixedAssetMaintenance', entityId: assetId, metadata: { kind: parsed.data.kind, cost: parsed.data.cost } });
    revalidatePath(`/dashboard/fixed-assets/${assetId}`);
    revalidatePath('/dashboard/fixed-assets');
    return { success: true, data: null, message: 'Mantención registrada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteMaintenanceAction(assetId: string, maintenanceId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('assets:write');
    await assetsService.deleteMaintenance(session.companyId, assetId, maintenanceId);
    revalidatePath(`/dashboard/fixed-assets/${assetId}`);
    return { success: true, data: null, message: 'Mantención eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

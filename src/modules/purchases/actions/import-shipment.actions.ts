'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { importCostsSchema, importItemsSchema, importShipmentSchema } from '../schema';
import * as importService from '../services/import-shipment.service';
import type { ImportShipmentDetail, ImportShipmentRow } from '../services/import-shipment.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof importService.ImportShipmentError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'importaciones', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateImport(id?: string): void {
  revalidatePath('/dashboard/purchases/imports');
  if (id) revalidatePath(`/dashboard/purchases/imports/${id}`);
}

export async function listImportShipmentsAction(): Promise<ActionResult<ImportShipmentRow[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    return { success: true, data: await importService.listImportShipments(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function getImportShipmentAction(id: string): Promise<ActionResult<ImportShipmentDetail>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const detail = await importService.getImportShipment(session.companyId, id);
    if (!detail) return { success: false, error: 'Carpeta no encontrada' };
    return { success: true, data: detail };
  } catch (error) {
    return fail(error);
  }
}

export async function listPurchaseDocumentOptionsAction(): Promise<ActionResult<{ id: string; label: string; netAmount: number }[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    return { success: true, data: await importService.listPurchaseDocumentOptions(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function createImportShipmentAction(input: unknown): Promise<ActionResult<{ id: string; folio: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const parsed = importShipmentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await importService.createImportShipment(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'ImportShipment', entityId: created.id, metadata: { folio: created.folio, reference: parsed.data.reference } });
    revalidateImport();
    return { success: true, data: created, message: `Carpeta N° ${created.folio} creada` };
  } catch (error) {
    return fail(error, companyId, { action: 'createImportShipment' });
  }
}

export async function updateImportShipmentAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const parsed = importShipmentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await importService.updateImportShipment(session.companyId, id, parsed.data);
    revalidateImport(id);
    return { success: true, data: null, message: 'Datos de la carpeta guardados' };
  } catch (error) {
    return fail(error, companyId, { action: 'updateImportShipment', id });
  }
}

export async function saveImportItemsAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const parsed = importItemsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await importService.saveImportItems(session.companyId, id, parsed.data);
    revalidateImport(id);
    return { success: true, data: null, message: 'Productos guardados' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveImportItems', id });
  }
}

export async function saveImportCostsAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const parsed = importCostsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await importService.saveImportCosts(session.companyId, id, parsed.data);
    revalidateImport(id);
    return { success: true, data: null, message: 'Costos guardados' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveImportCosts', id });
  }
}

export async function closeImportShipmentAction(id: string): Promise<ActionResult<{ landedTotal: number; items: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const result = await importService.closeImportShipment(session.companyId, session.id, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ImportShipment', entityId: id, metadata: { status: 'CLOSED', landedTotal: result.landedTotal, items: result.items } });
    revalidateImport(id);
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data: result, message: `Mercadería ingresada a bodega: ${result.items} producto${result.items === 1 ? '' : 's'}` };
  } catch (error) {
    return fail(error, companyId, { action: 'closeImportShipment', id });
  }
}

export async function cancelImportShipmentAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    await importService.cancelImportShipment(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'ImportShipment', entityId: id, metadata: { status: 'CANCELLED' } });
    revalidateImport(id);
    return { success: true, data: null, message: 'Carpeta anulada' };
  } catch (error) {
    return fail(error);
  }
}

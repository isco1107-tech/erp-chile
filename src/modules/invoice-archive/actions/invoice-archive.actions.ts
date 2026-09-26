'use server';

import { revalidatePath } from 'next/cache';
import type { ArchivedInvoice } from '@prisma/client';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { del } from '@/lib/storage/blob';
import * as archiveService from '../services/invoice-archive.service';
import type { ArchiveOverview } from '../services/invoice-archive.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function failure(error: unknown, fallback: string, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  captureException(error, { module: 'invoice-archive', companyId });
  return { success: false, error: fallback };
}

export async function getArchiveOverviewAction(): Promise<ActionResult<ArchiveOverview>> {
  try {
    const session = await requireAuthWithPermission('invoicearchive:read');
    return { success: true, data: await archiveService.getArchiveOverview(session.companyId) };
  } catch (error) {
    return failure(error, 'No se pudo cargar el archivo de facturas');
  }
}

export async function listSupplierInvoicesAction(supplierKey: string): Promise<ActionResult<ArchivedInvoice[]>> {
  try {
    const session = await requireAuthWithPermission('invoicearchive:read');
    if (typeof supplierKey !== 'string' || supplierKey.length > 200) return { success: false, error: 'Proveedor inválido' };
    return { success: true, data: await archiveService.listSupplierInvoices(session.companyId, supplierKey) };
  } catch (error) {
    return failure(error, 'No se pudo cargar el histórico del proveedor');
  }
}

export async function listSupplierSuggestionsAction(): Promise<ActionResult<Array<{ name: string; contactId: string | null }>>> {
  try {
    const session = await requireAuthWithPermission('invoicearchive:write');
    return { success: true, data: await archiveService.listSupplierSuggestions(session.companyId) };
  } catch (error) {
    return failure(error, 'No se pudieron cargar los proveedores');
  }
}

export async function deleteArchivedInvoiceAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('invoicearchive:write');
    companyId = session.companyId;
    const fileUrl = await archiveService.deleteArchivedInvoice(session.companyId, String(id));
    if (!fileUrl) return { success: false, error: 'La factura ya no existe' };
    // El archivo se borra después de la fila: si falla, queda un archivo huérfano, nunca una fila sin archivo.
    await del(fileUrl).catch((error) => captureException(error, { module: 'invoice-archive', companyId, extra: { reason: 'blob-delete' } }));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'ArchivedInvoice', entityId: String(id) });
    revalidatePath('/dashboard/invoice-archive');
    return { success: true, data: null, message: 'Factura eliminada del archivo' };
  } catch (error) {
    return failure(error, 'No se pudo eliminar la factura', companyId);
  }
}

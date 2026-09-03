'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type DocumentStatus, type DteType } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { salesDocumentCreateSchema } from '../schema';
import * as salesService from '../services/sales.service';
import type {
  ListSalesDocumentsResult,
  SalesDocumentWithItems,
  SalesDocumentWithRelations,
} from '../services/sales.service';
import { getContactOutstandingBalance } from '@/modules/treasury/services/treasury.service';
import { getContact } from '@/modules/contacts/services/contacts.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function redactSalesCosts<T extends { items: Array<{ unitCostPMP: number }> }>(document: T): T {
  return { ...document, items: document.items.map((item) => ({ ...item, unitCostPMP: 0 })) };
}

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe un documento con ese folio para este tipo de DTE';
  }
  return toFriendlyErrorMessage(error);
}

export async function listSalesDocumentsAction(
  dteTypes?: DteType[],
  status?: DocumentStatus,
  query?: string,
  page = 1,
  pageSize = 25,
  sortField?: 'issueDate' | 'totalAmount',
  sortDir?: 'asc' | 'desc'
): Promise<ActionResult<ListSalesDocumentsResult>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const data = await salesService.listSalesDocuments(session.companyId, {
      dteTypes,
      status,
      query,
      page,
      pageSize,
      sortField,
      sortDir,
    });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getSalesDocumentAction(id: string): Promise<ActionResult<SalesDocumentWithRelations>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const document = await salesService.getSalesDocument(session.companyId, id);
    if (!document) return { success: false, error: 'Documento no encontrado' };
    return { success: true, data: can(session, 'products:costs') ? document : redactSalesCosts(document) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export interface ContactCreditStatus {
  creditLimit: number | null;
  outstandingBalance: number;
  available: number | null;
}

/** Alimenta el aviso de crédito disponible en el formulario de venta, antes de intentar emitir. */
export async function getContactCreditStatusAction(contactId: string): Promise<ActionResult<ContactCreditStatus>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const contact = await getContact(session.companyId, contactId);
    if (!contact) return { success: false, error: 'Cliente no encontrado' };
    const outstandingBalance = await getContactOutstandingBalance(session.companyId, contactId);
    return {
      success: true,
      data: {
        creditLimit: contact.creditLimit,
        outstandingBalance,
        available: contact.creditLimit == null ? null : contact.creditLimit - outstandingBalance,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createSalesDocumentAction(
  input: unknown,
  status: 'DRAFT' | 'ISSUED'
): Promise<ActionResult<SalesDocumentWithItems>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const parsed = salesDocumentCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await salesService.createSalesDocument(session.companyId, parsed.data, status);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: status === 'ISSUED' ? 'ISSUE_DTE' : 'CREATE',
      entity: 'SalesDocument',
      entityId: data.id,
      metadata: { dteType: data.dteType, folio: data.folio, totalAmount: data.totalAmount, status: data.status },
    });
    revalidatePath('/dashboard/sales');
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return {
      success: true,
      data: can(session, 'products:costs') ? data : redactSalesCosts(data),
      message: status === 'ISSUED' ? 'Documento emitido correctamente' : 'Borrador guardado',
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function cancelSalesDocumentAction(id: string, reason?: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('sales:cancel');
    const cleanReason = reason?.trim() || 'Anulación solicitada por usuario';
    const cancelled = await salesService.cancelSalesDocument(session.companyId, id, cleanReason);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CANCEL_DTE',
      entity: 'SalesDocument',
      entityId: cancelled.id,
      metadata: {
        dteType: cancelled.dteType,
        folio: cancelled.folio,
        totalAmount: cancelled.totalAmount,
        reason: cleanReason,
      },
    });
    revalidatePath('/dashboard/sales');
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data: null, message: 'Documento anulado y stock reingresado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function duplicateSalesDocumentAction(id: string): Promise<ActionResult<SalesDocumentWithItems>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const data = await salesService.duplicateSalesDocument(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SalesDocument',
      entityId: data.id,
      metadata: { duplicatedFrom: id },
    });
    revalidatePath('/dashboard/sales');
    return { success: true, data, message: 'Documento duplicado como borrador' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

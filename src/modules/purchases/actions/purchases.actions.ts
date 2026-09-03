'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma, type DocumentStatus, type PurchaseDocument } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { purchaseDocumentCreateSchema } from '../schema';
import * as purchasesService from '../services/purchases.service';
import { getCompanySettings } from '@/lib/services/company.service';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import type {
  ListPurchaseDocumentsResult,
  PendingApprovalItem,
  PurchaseDocumentWithItems,
  PurchaseDocumentWithRelations,
} from '../services/purchases.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return 'Ya existe un documento con ese folio para este proveedor';
  }
  return toFriendlyErrorMessage(error);
}

export async function listPurchaseDocumentsAction(
  status?: DocumentStatus,
  query?: string,
  page = 1,
  pageSize = 25
): Promise<ActionResult<ListPurchaseDocumentsResult>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const data = await purchasesService.listPurchaseDocuments(session.companyId, { status, query, page, pageSize });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPurchaseDocumentAction(id: string): Promise<ActionResult<PurchaseDocumentWithRelations>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const document = await purchasesService.getPurchaseDocument(session.companyId, id);
    if (!document) return { success: false, error: 'Documento no encontrado' };
    return { success: true, data: document };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Para el aviso en el formulario de compra: cuánto puede emitirse antes de quedar pendiente de aprobación. */
export async function getPurchaseApprovalThresholdAction(): Promise<ActionResult<number | null>> {
  try {
    const session = await requireAuthWithPermission('purchases:write');
    const settings = await getCompanySettings(session.companyId);
    return { success: true, data: settings.purchaseApprovalThreshold };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPurchaseDocumentAction(
  input: unknown,
  status: 'DRAFT' | 'ISSUED'
): Promise<ActionResult<PurchaseDocumentWithItems>> {
  try {
    const session = await requireAuthWithPermission('purchases:write');
    const parsed = purchaseDocumentCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await purchasesService.createPurchaseDocument(session.companyId, parsed.data, status);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PurchaseDocument',
      entityId: data.id,
      metadata: { documentType: data.documentType, folio: data.folio, totalAmount: data.totalAmount, status: data.status },
    });
    const pending = data.approvalStatus === 'PENDING';
    revalidatePath('/dashboard/purchases');
    revalidatePath('/dashboard/treasury/cxp');
    if (!pending) {
      revalidatePath('/dashboard/inventory');
      revalidatePath('/dashboard/products');
    }
    return {
      success: true,
      data,
      message: pending
        ? 'Supera el límite configurado: queda pendiente de aprobación antes de afectar inventario'
        : status === 'ISSUED'
          ? 'Documento registrado correctamente'
          : 'Borrador guardado',
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updatePurchaseDocumentAction(
  id: string,
  input: unknown
): Promise<ActionResult<PurchaseDocumentWithItems>> {
  try {
    const session = await requireAuthWithPermission('purchases:write');
    const parsed = purchaseDocumentCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await purchasesService.updatePurchaseDocument(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PurchaseDocument',
      entityId: data.id,
      metadata: { reason: 'draft_edited', documentType: data.documentType, folio: data.folio, totalAmount: data.totalAmount },
    });
    revalidatePath('/dashboard/purchases');
    revalidatePath(`/dashboard/purchases/${id}`);
    return { success: true, data, message: 'Borrador actualizado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function issuePurchaseDocumentAction(id: string): Promise<ActionResult<PurchaseDocumentWithItems>> {
  try {
    const session = await requireAuthWithPermission('purchases:write');
    const data = await purchasesService.issuePurchaseDocument(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PurchaseDocument',
      entityId: data.id,
      metadata: { reason: 'draft_issued', documentType: data.documentType, folio: data.folio, totalAmount: data.totalAmount, status: data.status },
    });
    revalidatePath('/dashboard/purchases');
    revalidatePath('/dashboard/treasury/cxp');
    revalidatePath(`/dashboard/purchases/${id}`);
    if (data.approvalStatus !== 'PENDING') {
      revalidatePath('/dashboard/inventory');
      revalidatePath('/dashboard/products');
    }
    return {
      success: true,
      data,
      message: data.approvalStatus === 'PENDING' ? 'Supera el límite configurado: queda pendiente de aprobación' : 'Documento emitido correctamente',
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const rejectPurchaseDocumentSchema = z.object({ notes: z.string().max(500).optional() });
const overrideMatchSchema = z.object({ notes: z.string().max(500).optional() });

export async function overridePurchaseMatchAction(id: string, input: unknown): Promise<ActionResult<PurchaseDocument>> {
  try {
    const session = await requireAuthWithPermission('purchases:override_match');
    const parsed = overrideMatchSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await purchasesService.overridePurchaseMatch(session.companyId, id, session.id, parsed.data.notes);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PurchaseDocument',
      entityId: data.id,
      metadata: { reason: 'purchase_match_overridden', notes: parsed.data.notes },
    });
    revalidatePath('/dashboard/purchases');
    revalidatePath('/dashboard/treasury/cxp');
    return { success: true, data, message: 'Diferencia forzada: el pago ya se puede registrar' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listPendingApprovalsAction(): Promise<ActionResult<PendingApprovalItem[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:approve');
    const data = await purchasesService.listPendingApprovals(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function approvePurchaseDocumentAction(id: string): Promise<ActionResult<PurchaseDocumentWithItems>> {
  try {
    const session = await requireAuthWithPermission('purchases:approve');
    const data = await purchasesService.approvePurchaseDocument(session.companyId, id, session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PurchaseDocument',
      entityId: data.id,
      metadata: { reason: 'purchase_approved', totalAmount: data.totalAmount },
    });
    revalidatePath('/dashboard/purchases');
    revalidatePath('/dashboard/treasury/cxp');
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data, message: 'Compra aprobada y emitida' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function rejectPurchaseDocumentAction(id: string, input: unknown): Promise<ActionResult<PurchaseDocument>> {
  try {
    const session = await requireAuthWithPermission('purchases:approve');
    const parsed = rejectPurchaseDocumentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await purchasesService.rejectPurchaseDocument(session.companyId, id, session.id, parsed.data.notes);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PurchaseDocument',
      entityId: data.id,
      metadata: { reason: 'purchase_rejected', notes: parsed.data.notes },
    });
    revalidatePath('/dashboard/purchases');
    return { success: true, data, message: 'Compra rechazada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function cancelPurchaseDocumentAction(id: string, reason?: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('purchases:cancel');
    const cleanReason = reason?.trim() || 'Anulación solicitada por usuario';
    const cancelled = await purchasesService.cancelPurchaseDocument(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CANCEL_DTE',
      entity: 'PurchaseDocument',
      entityId: cancelled.id,
      metadata: {
        documentType: cancelled.documentType,
        folio: cancelled.folio,
        totalAmount: cancelled.totalAmount,
        reason: cleanReason,
      },
    });
    revalidatePath('/dashboard/purchases');
    revalidatePath('/dashboard/treasury/cxp');
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/products');
    return { success: true, data: null, message: 'Documento anulado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

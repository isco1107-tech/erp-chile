'use server';

import { revalidatePath } from 'next/cache';
import type { PurchaseRequestStatus } from '@prisma/client';
import { z } from 'zod';
import { authErrorMessage, can, requireAuthWithPermission, type AuthContext } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { purchaseAwardSchema, purchaseRequestSchema, supplierQuoteSchema } from '../schema';
import * as requestService from '../services/purchase-request.service';
import type { PurchaseRequestDetail, PurchaseRequestRow } from '../services/purchase-request.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof requestService.PurchaseRequestError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'solicitudes-compra', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

/** Compras y jefatura ven todas las solicitudes; el resto, solo las suyas. */
function managesAll(context: AuthContext): boolean {
  return can(context, 'purchases:orders') || can(context, 'purchases:approve');
}

function revalidateRequest(id?: string): void {
  revalidatePath('/dashboard/purchase-requests');
  if (id) revalidatePath(`/dashboard/purchase-requests/${id}`);
}

const STATUS_FILTERS = ['OPEN', 'ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED'] as const;

export async function listPurchaseRequestsAction(status: string = 'OPEN'): Promise<ActionResult<PurchaseRequestRow[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:request');
    const filter = (STATUS_FILTERS as readonly string[]).includes(status) ? (status as PurchaseRequestStatus | 'OPEN' | 'ALL') : 'OPEN';
    const rows = await requestService.listPurchaseRequests(session.companyId, { status: filter, onlyUserId: managesAll(session) ? undefined : session.id });
    // El costo de referencia sale del PMP: solo lo ve quien puede ver costos.
    const showCosts = can(session, 'products:costs');
    return { success: true, data: showCosts ? rows : rows.map((row) => ({ ...row, estimatedTotal: null })) };
  } catch (error) {
    return fail(error);
  }
}

export async function getPurchaseRequestAction(id: string): Promise<ActionResult<PurchaseRequestDetail>> {
  try {
    const session = await requireAuthWithPermission('purchases:request');
    const detail = await requestService.getPurchaseRequest(session.companyId, id);
    if (!detail || (!managesAll(session) && detail.requestedById !== session.id)) return { success: false, error: 'Solicitud no encontrada' };
    const showCosts = can(session, 'products:costs');
    return { success: true, data: showCosts ? detail : { ...detail, items: detail.items.map((item) => ({ ...item, estimatedUnitCost: null })) } };
  } catch (error) {
    return fail(error);
  }
}

export async function createPurchaseRequestAction(input: unknown, submit: boolean): Promise<ActionResult<{ id: string; folio: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:request');
    companyId = session.companyId;
    const parsed = purchaseRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await requestService.createPurchaseRequest(session.companyId, { id: session.id, name: session.name }, parsed.data, submit);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PurchaseRequest',
      entityId: created.id,
      metadata: { folio: created.folio, items: parsed.data.items.length, submitted: submit },
    });
    revalidateRequest();
    return { success: true, data: created, message: submit ? `Solicitud N° ${created.folio} enviada a aprobación` : `Borrador N° ${created.folio} guardado` };
  } catch (error) {
    return fail(error, companyId, { action: 'createPurchaseRequest' });
  }
}

export async function updatePurchaseRequestAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:request');
    companyId = session.companyId;
    const parsed = purchaseRequestSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await requestService.updatePurchaseRequest(session.companyId, session.id, id, parsed.data, managesAll(session));
    revalidateRequest(id);
    return { success: true, data: null, message: 'Solicitud actualizada' };
  } catch (error) {
    return fail(error, companyId, { action: 'updatePurchaseRequest', id });
  }
}

export async function submitPurchaseRequestAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('purchases:request');
    await requestService.submitPurchaseRequest(session.companyId, session.id, id, managesAll(session));
    revalidateRequest(id);
    return { success: true, data: null, message: 'Solicitud enviada a aprobación' };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelPurchaseRequestAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('purchases:request');
    await requestService.cancelPurchaseRequest(session.companyId, session.id, id, managesAll(session));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'PurchaseRequest', entityId: id, metadata: { status: 'CANCELLED' } });
    revalidateRequest(id);
    return { success: true, data: null, message: 'Solicitud anulada' };
  } catch (error) {
    return fail(error);
  }
}

const decisionSchema = z.object({ approve: z.boolean(), reason: z.string().trim().max(500).optional() });

export async function decidePurchaseRequestAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:approve');
    companyId = session.companyId;
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };
    await requestService.decidePurchaseRequest(
      session.companyId,
      { id: session.id, name: session.name, isOwner: session.role === 'OWNER' },
      id,
      parsed.data.approve,
      parsed.data.reason
    );
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PurchaseRequest',
      entityId: id,
      metadata: { status: parsed.data.approve ? 'APPROVED' : 'REJECTED', reason: parsed.data.reason ?? null },
    });
    revalidateRequest(id);
    return { success: true, data: null, message: parsed.data.approve ? 'Solicitud aprobada: ya se puede cotizar y generar la OC' : 'Solicitud rechazada' };
  } catch (error) {
    return fail(error, companyId, { action: 'decidePurchaseRequest', id });
  }
}

export async function saveSupplierQuoteAction(requestId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const parsed = supplierQuoteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const saved = await requestService.saveSupplierQuote(session.companyId, requestId, parsed.data);
    revalidateRequest(requestId);
    return { success: true, data: saved, message: 'Cotización guardada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveSupplierQuote', requestId });
  }
}

export async function deleteSupplierQuoteAction(requestId: string, quoteId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    await requestService.deleteSupplierQuote(session.companyId, requestId, quoteId);
    revalidateRequest(requestId);
    return { success: true, data: null, message: 'Cotización eliminada' };
  } catch (error) {
    return fail(error);
  }
}

export async function generatePurchaseOrdersAction(requestId: string, input: unknown): Promise<ActionResult<{ orders: { id: string; folio: number }[] }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const parsed = purchaseAwardSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const result = await requestService.generatePurchaseOrders(session.companyId, requestId, parsed.data.award, parsed.data.expectedDate);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: result.orders[0]?.id ?? requestId,
      metadata: { source: 'PurchaseRequest', requestId, orders: result.orders.map((order) => order.folio) },
    });
    revalidateRequest(requestId);
    revalidatePath('/dashboard/purchases/orders');
    const count = result.orders.length;
    return { success: true, data: result, message: `${count} orden${count === 1 ? '' : 'es'} de compra generada${count === 1 ? '' : 's'} (N° ${result.orders.map((order) => order.folio).join(', ')})` };
  } catch (error) {
    return fail(error, companyId, { action: 'generatePurchaseOrders', requestId });
  }
}

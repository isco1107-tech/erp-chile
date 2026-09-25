'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { RECEIVED_DTE_FILTERS, receivedDteDecisionSchema } from '../schema';
import * as receivedService from '../services/received.service';
import type { ReceivedDteDetail, ReceivedDteFilter, ReceivedDteRow, ReceivedDteSummary, RegisterResult } from '../services/received.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof receivedService.ReceivedDteError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'dte-recibidos', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateInbox(id?: string): void {
  revalidatePath('/dashboard/purchases/inbox');
  if (id) revalidatePath(`/dashboard/purchases/inbox/${id}`);
}

export async function listReceivedDtesAction(
  filter: string = 'ALL',
  q?: string
): Promise<ActionResult<{ rows: ReceivedDteRow[]; summary: ReceivedDteSummary }>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const safeFilter = (RECEIVED_DTE_FILTERS as readonly string[]).includes(filter) ? (filter as ReceivedDteFilter) : 'ALL';
    return { success: true, data: await receivedService.listReceivedDtes(session.companyId, { filter: safeFilter, q: q?.slice(0, 100) }) };
  } catch (error) {
    return fail(error);
  }
}

export async function getReceivedDteAction(id: string): Promise<ActionResult<ReceivedDteDetail>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const detail = await receivedService.getReceivedDte(session.companyId, id);
    if (!detail) return { success: false, error: 'Documento no encontrado' };
    return { success: true, data: detail };
  } catch (error) {
    return fail(error);
  }
}

export async function decideReceivedDteAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:write');
    companyId = session.companyId;
    const parsed = receivedDteDecisionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await receivedService.setReceivedDteStatus(session.companyId, session.id, id, parsed.data.status, parsed.data.note);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'ReceivedDte',
      entityId: id,
      metadata: { status: parsed.data.status, note: parsed.data.note ?? null },
    });
    revalidateInbox(id);
    const messages = {
      ACCEPTED: 'Documento aceptado',
      CLAIMED: 'Reclamo registrado. Recuerda ingresarlo también en sii.cl dentro del plazo',
      PENDING: 'Documento devuelto a pendiente',
    } as const;
    return { success: true, data: null, message: messages[parsed.data.status] };
  } catch (error) {
    return fail(error, companyId, { action: 'decideReceivedDte', id });
  }
}

export async function registerReceivedDteAction(id: string): Promise<ActionResult<RegisterResult>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:write');
    companyId = session.companyId;
    const result = await receivedService.registerReceivedDteAsPurchase(session.companyId, session.id, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PurchaseDocument',
      entityId: result.purchaseDocumentId,
      metadata: { source: 'ReceivedDte', receivedDteId: id, linkedExisting: result.linkedExisting, createdSupplier: result.createdSupplier },
    });
    revalidateInbox(id);
    revalidatePath('/dashboard/purchases');
    const parts = [result.linkedExisting ? 'Ya estaba en Compras: quedó vinculado' : 'Compra creada como borrador'];
    if (result.createdSupplier) parts.push('se agregó el proveedor a Contactos');
    if (result.totalDifference !== 0) parts.push('revisa el total: difiere del documento por descuentos o redondeo');
    return { success: true, data: result, message: parts.join('; ') };
  } catch (error) {
    return fail(error, companyId, { action: 'registerReceivedDte', id });
  }
}

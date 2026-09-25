'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { paymentBatchSchema } from '../schema';
import * as batchesService from '../services/payment-batches.service';
import type { PayableOption, PaymentBatchDetail, PaymentBatchListItem } from '../services/payment-batches.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (!(error instanceof Error)) captureException(error, { module: 'tesoreria', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

export async function listPaymentBatchesAction(): Promise<ActionResult<PaymentBatchListItem[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await batchesService.listPaymentBatches(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function listPayableOptionsAction(): Promise<ActionResult<PayableOption[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await batchesService.listPayableOptions(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function getPaymentBatchAction(id: string): Promise<ActionResult<PaymentBatchDetail>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const batch = await batchesService.getPaymentBatch(session.companyId, String(id));
    if (!batch) return { success: false, error: 'Nómina no encontrada' };
    return { success: true, data: batch };
  } catch (error) {
    return fail(error);
  }
}

export async function createPaymentBatchAction(input: unknown): Promise<ActionResult<{ id: string; folio: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = paymentBatchSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await batchesService.createPaymentBatch(session.companyId, session.id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PaymentBatch',
      entityId: data.id,
      metadata: { folio: data.folio, items: parsed.data.items.length },
    });
    revalidatePath('/dashboard/treasury/payment-batches');
    return { success: true, data, message: `Nómina #${data.folio} creada` };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function markPaymentBatchPaidAction(id: string): Promise<ActionResult<{ payments: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const payments = await batchesService.markPaymentBatchPaid(session.companyId, session.id, String(id));
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PaymentBatch',
      entityId: String(id),
      metadata: { status: 'PAID', payments },
    });
    revalidatePath('/dashboard/treasury/payment-batches');
    revalidatePath(`/dashboard/treasury/payment-batches/${id}`);
    revalidatePath('/dashboard/treasury/cxp');
    revalidatePath('/dashboard/treasury/cashflow');
    return { success: true, data: { payments }, message: `Nómina pagada: ${payments} factura${payments === 1 ? '' : 's'} abonada${payments === 1 ? '' : 's'}` };
  } catch (error) {
    return fail(error, companyId, { batchId: id });
  }
}

export async function cancelPaymentBatchAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    await batchesService.cancelPaymentBatch(session.companyId, String(id));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'PaymentBatch', entityId: String(id), metadata: { status: 'CANCELLED' } });
    revalidatePath('/dashboard/treasury/payment-batches');
    revalidatePath(`/dashboard/treasury/payment-batches/${id}`);
    return { success: true, data: null, message: 'Nómina anulada' };
  } catch (error) {
    return fail(error, companyId, { batchId: id });
  }
}

export async function removePaymentBatchItemAction(batchId: string, itemId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    await batchesService.removePaymentBatchItem(session.companyId, String(batchId), String(itemId));
    revalidatePath(`/dashboard/treasury/payment-batches/${batchId}`);
    return { success: true, data: null, message: 'Factura quitada de la nómina' };
  } catch (error) {
    return fail(error, companyId, { batchId });
  }
}

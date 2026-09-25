'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { rcvDraftSchema, rcvPeriodSchema } from '../schema';
import * as rcvService from '../services/rcv.service';
import type { RcvView } from '../services/rcv.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof rcvService.RcvError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'rcv', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

export async function getRcvViewAction(input: unknown): Promise<ActionResult<RcvView>> {
  try {
    const session = await requireAuthWithPermission('reports:read');
    const parsed = rcvPeriodSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Período inválido' };
    return { success: true, data: await rcvService.getRcvView(session.companyId, parsed.data.kind, parsed.data.year, parsed.data.month) };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Registra como borrador de compra una factura que el SII tiene y el ERP no.
 * Exige `purchases:write` además de ver el RCV: crea un documento de compra.
 */
export async function createDraftFromRcvAction(input: unknown): Promise<ActionResult<{ purchaseDocumentId: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:write');
    companyId = session.companyId;
    const parsed = rcvDraftSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Datos inválidos' };
    const result = await rcvService.createDraftFromRcvEntry(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PurchaseDocument',
      entityId: result.purchaseDocumentId,
      metadata: { source: 'RCV', year: parsed.data.year, month: parsed.data.month, createdSupplier: result.createdSupplier },
    });
    revalidatePath('/dashboard/reports/rcv');
    revalidatePath('/dashboard/purchases');
    return {
      success: true,
      data: { purchaseDocumentId: result.purchaseDocumentId },
      message: result.createdSupplier ? 'Borrador creado y proveedor agregado a Contactos' : 'Borrador de compra creado',
    };
  } catch (error) {
    return fail(error, companyId, { action: 'createDraftFromRcv' });
  }
}

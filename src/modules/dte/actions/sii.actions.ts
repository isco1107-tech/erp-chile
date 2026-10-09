'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import {
  refreshDocumentSiiStatus,
  SiiSubmissionError,
  submitDocumentToSii,
} from '../services/sii-submission.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toError(error: unknown, companyId: string | undefined, documentId: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof SiiSubmissionError) return { success: false, error: error.message };
  captureException(error, { module: 'dte', companyId, extra: { documentId } });
  return { success: false, error: 'No se pudo completar la operación con el SII' };
}

export async function submitToSiiAction(documentId: string): Promise<ActionResult<{ trackId: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('sales:write');
    companyId = session.companyId;
    const sent = await submitDocumentToSii(session.companyId, documentId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SalesDocument',
      entityId: documentId,
      metadata: { operation: 'SII_SUBMIT', dteType: sent.dteType, folio: sent.folio, trackId: sent.trackId, simulated: true },
    });
    revalidatePath(`/dashboard/sales/${documentId}`);
    return { success: true, data: { trackId: sent.trackId }, message: `Enviado (simulación). Track ID ${sent.trackId}` };
  } catch (error) {
    return toError(error, companyId, documentId);
  }
}

export async function refreshSiiStatusAction(documentId: string): Promise<ActionResult<{ status: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('sales:write');
    companyId = session.companyId;
    const result = await refreshDocumentSiiStatus(session.companyId, documentId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'SalesDocument',
      entityId: documentId,
      metadata: { operation: 'SII_STATUS', dteType: result.dteType, folio: result.folio, status: result.status, simulated: true },
    });
    revalidatePath(`/dashboard/sales/${documentId}`);
    return { success: true, data: { status: result.status }, message: 'Estado actualizado (simulación)' };
  } catch (error) {
    return toError(error, companyId, documentId);
  }
}

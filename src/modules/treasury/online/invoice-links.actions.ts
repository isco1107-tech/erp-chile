'use server';

import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { createInvoicePaymentLink } from './invoice-links.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

/** Crea (o reutiliza, si hay uno vigente) el link de pago en línea de un documento por cobrar. */
export async function createInvoicePaymentLinkAction(salesDocumentId: string): Promise<ActionResult<{ url: string; amount: number }>> {
  try {
    const session = await requireAuthWithPermission('treasury:write');
    if (typeof salesDocumentId !== 'string' || !salesDocumentId) return { success: false, error: 'Documento inválido' };
    const data = await createInvoicePaymentLink(session.companyId, salesDocumentId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'InvoicePaymentLink',
      entityId: salesDocumentId,
      metadata: { amount: data.amount },
    });
    return { success: true, data, message: 'Link de pago listo para compartir' };
  } catch (error) {
    return { success: false, error: authErrorMessage(error) ?? toFriendlyErrorMessage(error) };
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { QUOTE_TARGET_DTE_TYPES } from '../schema';
import { convertQuoteToDraft } from '../services/quote-conversion.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

const convertSchema = z.object({ target: z.enum(QUOTE_TARGET_DTE_TYPES, 'Elige el documento') });

/** Convierte una cotización en un borrador de factura/boleta/guía para revisar y emitir. */
export async function convertQuoteAction(quoteId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAuthWithPermission('sales:write');
    const parsed = convertSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const draft = await convertQuoteToDraft(session.companyId, quoteId, parsed.data.target);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'SalesDocument',
      entityId: draft.id,
      metadata: { fromQuote: quoteId, dteType: draft.dteType, totalAmount: draft.totalAmount },
    });
    revalidatePath('/dashboard/sales');
    return { success: true, data: { id: draft.id }, message: 'Borrador creado desde la cotización: revísalo y emítelo' };
  } catch (error) {
    return { success: false, error: authErrorMessage(error) ?? toFriendlyErrorMessage(error) };
  }
}

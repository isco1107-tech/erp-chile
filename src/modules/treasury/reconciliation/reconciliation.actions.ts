'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { emitPaymentEvent } from '../services/movements.service';
import { statementActionSchema } from './schema';
import * as reconciliationService from './reconciliation.service';
import type { ReconciliationBoard } from './reconciliation.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  return authErrorMessage(error) ?? toFriendlyErrorMessage(error);
}

const boardQuerySchema = z.object({
  treasuryAccountId: z.string().min(1),
  status: z.enum(['UNMATCHED', 'MATCHED', 'IGNORED']).default('UNMATCHED'),
});

export async function getReconciliationBoardAction(input: unknown): Promise<ActionResult<ReconciliationBoard>> {
  try {
    const session = await requireAuthWithPermission('bank:reconcile');
    const parsed = boardQuerySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Elige una cuenta' };
    return { success: true, data: await reconciliationService.getReconciliationBoard(session.companyId, parsed.data.treasuryAccountId, parsed.data.status) };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function applyStatementActionAction(lineId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('bank:reconcile');
    const parsed = statementActionSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Acción inválida' };
    const payment = await reconciliationService.applyStatementAction(session.companyId, lineId, parsed.data, session.id);
    if (payment) emitPaymentEvent(session.companyId, payment);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'BankStatementLine',
      entityId: lineId,
      metadata: { action: parsed.data.kind, paymentId: payment?.id ?? null },
    });
    revalidatePath('/dashboard/treasury/reconciliation');
    revalidatePath('/dashboard/treasury/cashflow');
    const messages = { MATCH: 'Movimiento conciliado', SALES_DOCUMENT: 'Cobro registrado y conciliado', PURCHASE_DOCUMENT: 'Pago registrado y conciliado', OTHER: 'Movimiento registrado y conciliado', IGNORE: 'Movimiento ignorado', UNDO: 'Conciliación deshecha' } as const;
    return { success: true, data: null, message: messages[parsed.data.kind] };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function autoMatchAction(treasuryAccountId: string): Promise<ActionResult<{ matched: number }>> {
  try {
    const session = await requireAuthWithPermission('bank:reconcile');
    if (typeof treasuryAccountId !== 'string' || !treasuryAccountId) return { success: false, error: 'Elige una cuenta' };
    const matched = await reconciliationService.autoMatch(session.companyId, treasuryAccountId, session.id);
    if (matched > 0) {
      await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'BankStatementLine', entityId: treasuryAccountId, metadata: { autoMatched: matched } });
    }
    revalidatePath('/dashboard/treasury/reconciliation');
    return { success: true, data: { matched }, message: matched > 0 ? `${matched} movimiento(s) conciliados automáticamente` : 'No hubo calces claros para conciliar solos' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

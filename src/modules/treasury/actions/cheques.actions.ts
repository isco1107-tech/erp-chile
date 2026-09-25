'use server';

import { revalidatePath } from 'next/cache';
import type { ChequeDirection, ChequeStatus } from '@prisma/client';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { chequeReasonSchema, chequeSchema } from '../schema';
import * as chequesService from '../services/cheques.service';
import type { ChequeRow, ChequeSummary } from '../services/cheques.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (!(error instanceof Error)) captureException(error, { module: 'tesoreria', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateCheques(): void {
  revalidatePath('/dashboard/treasury/cheques');
  revalidatePath('/dashboard/treasury/cxc');
  revalidatePath('/dashboard/treasury/cxp');
  revalidatePath('/dashboard/treasury/cashflow');
}

const DIRECTIONS: readonly ChequeDirection[] = ['RECEIVED', 'ISSUED'];
const STATUSES: readonly (ChequeStatus | 'OPEN' | 'ALL')[] = ['OPEN', 'ALL', 'PORTFOLIO', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'VOIDED'];

export async function listChequesAction(direction: string, status?: string, query?: string): Promise<ActionResult<ChequeRow[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const dir = DIRECTIONS.find((value) => value === direction) ?? 'RECEIVED';
    const st = STATUSES.find((value) => value === status) ?? 'OPEN';
    return { success: true, data: await chequesService.listCheques(session.companyId, { direction: dir, status: st, query: query?.slice(0, 80) }) };
  } catch (error) {
    return fail(error);
  }
}

export async function getChequeSummaryAction(): Promise<ActionResult<ChequeSummary>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await chequesService.getChequeSummary(session.companyId, new Date()) };
  } catch (error) {
    return fail(error);
  }
}

export async function createChequeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = chequeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const cheque = await chequesService.createCheque(session.companyId, session.id, {
      ...parsed.data,
      documentId: parsed.data.documentId || undefined,
      contactId: parsed.data.contactId || undefined,
      bankAccountId: parsed.data.bankAccountId || undefined,
    });
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Cheque',
      entityId: cheque.id,
      metadata: { direction: cheque.direction, number: cheque.number, amount: cheque.amount, paymentId: cheque.paymentId },
    });
    revalidateCheques();
    return { success: true, data: { id: cheque.id }, message: cheque.paymentId ? 'Cheque registrado y documento abonado' : 'Cheque registrado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

type ChequeTransition = 'deposit' | 'clear' | 'bounce' | 'void';

async function transition(kind: ChequeTransition, id: string, input: { bankAccountId?: string; date?: string; reason?: string }): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const today = new Date().toISOString().slice(0, 10);
    const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : today;
    let message: string;
    if (kind === 'deposit') {
      if (!input.bankAccountId) return { success: false, error: 'Selecciona la cuenta donde se depositó' };
      await chequesService.depositCheque(session.companyId, id, input.bankAccountId, date);
      message = 'Cheque depositado';
    } else if (kind === 'clear') {
      await chequesService.clearCheque(session.companyId, id, date);
      message = 'Cheque marcado como cobrado';
    } else {
      const parsed = chequeReasonSchema.safeParse({ reason: input.reason });
      if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Indica el motivo' };
      if (kind === 'bounce') {
        await chequesService.bounceCheque(session.companyId, session.id, id, parsed.data.reason);
        message = 'Cheque protestado: el documento volvió a quedar por cobrar';
      } else {
        await chequesService.voidCheque(session.companyId, session.id, id, parsed.data.reason);
        message = 'Cheque anulado';
      }
    }
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Cheque',
      entityId: id,
      metadata: { transition: kind, reason: input.reason ?? null },
    });
    revalidateCheques();
    return { success: true, data: null, message };
  } catch (error) {
    return fail(error, companyId, { chequeId: id, kind });
  }
}

export async function depositChequeAction(id: string, bankAccountId: string, date?: string): Promise<ActionResult<null>> {
  return transition('deposit', String(id), { bankAccountId: String(bankAccountId), date });
}

export async function clearChequeAction(id: string, date?: string): Promise<ActionResult<null>> {
  return transition('clear', String(id), { date });
}

export async function bounceChequeAction(id: string, reason: string): Promise<ActionResult<null>> {
  return transition('bounce', String(id), { reason: String(reason ?? '') });
}

export async function voidChequeAction(id: string, reason: string): Promise<ActionResult<null>> {
  return transition('void', String(id), { reason: String(reason ?? '') });
}

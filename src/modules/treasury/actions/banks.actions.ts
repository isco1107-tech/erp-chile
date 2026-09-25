'use server';

import { revalidatePath } from 'next/cache';
import type { BankLineStatus } from '@prisma/client';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { constraintInvolves, toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { normalizeAccountNumber } from '@/lib/treasury/banks';
import { bankAccountSchema, bankLineIgnoreSchema, bankLineMatchSchema, bankLineRegisterSchema } from '../schema';
import * as banksService from '../services/banks.service';
import type { BankAccountRow, OpenDocumentOption, OpenPaymentView, ReconciliationView } from '../services/banks.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (constraintInvolves(error, 'accountNumber')) return { success: false, error: 'Esa cuenta ya está registrada' };
  if (!(error instanceof Error)) captureException(error, { module: 'tesoreria', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateBanks(bankAccountId?: string): void {
  revalidatePath('/dashboard/treasury/banks');
  if (bankAccountId) revalidatePath(`/dashboard/treasury/banks/${bankAccountId}`);
  revalidatePath('/dashboard/treasury/cashflow');
}

export async function listBankAccountsAction(includeInactive = false): Promise<ActionResult<BankAccountRow[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await banksService.listBankAccounts(session.companyId, { includeInactive }) };
  } catch (error) {
    return fail(error);
  }
}

export async function saveBankAccountAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = bankAccountSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = { ...parsed.data, accountNumber: normalizeAccountNumber(parsed.data.accountNumber), openingDate: parsed.data.openingDate || undefined };
    let savedId: string;
    if (id) {
      await banksService.updateBankAccount(session.companyId, id, data);
      savedId = id;
    } else {
      savedId = (await banksService.createBankAccount(session.companyId, data)).id;
    }
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: id ? 'UPDATE' : 'CREATE',
      entity: 'BankAccount',
      entityId: savedId,
      metadata: { name: data.name, bankCode: data.bankCode },
    });
    revalidateBanks(savedId);
    return { success: true, data: { id: savedId }, message: id ? 'Cuenta actualizada' : 'Cuenta bancaria creada' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function getReconciliationAction(bankAccountId: string, status?: BankLineStatus | 'ALL'): Promise<ActionResult<ReconciliationView>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const view = await banksService.getReconciliation(session.companyId, String(bankAccountId), { status });
    if (!view) return { success: false, error: 'Cuenta bancaria no encontrada' };
    return { success: true, data: view };
  } catch (error) {
    return fail(error);
  }
}

export async function runAutoMatchAction(bankAccountId: string): Promise<ActionResult<{ matched: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const matched = await banksService.runAutoMatch(session.companyId, String(bankAccountId), session.id);
    revalidateBanks(bankAccountId);
    return { success: true, data: { matched }, message: matched === 0 ? 'No hay coincidencias seguras nuevas' : `${matched} movimiento${matched === 1 ? '' : 's'} conciliado${matched === 1 ? '' : 's'}` };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function matchBankLineAction(lineId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = bankLineMatchSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await banksService.matchLine(session.companyId, session.id, String(lineId), parsed.data.paymentIds);
    revalidateBanks();
    return { success: true, data: null, message: 'Movimiento conciliado' };
  } catch (error) {
    return fail(error, companyId, { lineId });
  }
}

export async function unmatchBankLineAction(lineId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    await banksService.unmatchLine(session.companyId, String(lineId));
    revalidateBanks();
    return { success: true, data: null, message: 'Conciliación deshecha' };
  } catch (error) {
    return fail(error, companyId, { lineId });
  }
}

export async function ignoreBankLineAction(lineId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = bankLineIgnoreSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await banksService.ignoreLine(session.companyId, session.id, String(lineId), parsed.data.reason);
    revalidateBanks();
    return { success: true, data: null, message: 'Movimiento marcado sin registro en libros' };
  } catch (error) {
    return fail(error, companyId, { lineId });
  }
}

export async function listOpenDocumentsForLineAction(lineId: string, query?: string): Promise<ActionResult<OpenDocumentOption[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await banksService.listOpenDocumentsForLine(session.companyId, String(lineId), query?.slice(0, 80)) };
  } catch (error) {
    return fail(error);
  }
}

export async function registerFromBankLineAction(lineId: string, input: unknown): Promise<ActionResult<{ payments: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = bankLineRegisterSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const payments = await banksService.registerFromLine(session.companyId, session.id, String(lineId), parsed.data.allocations);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Payment',
      entityId: String(lineId),
      metadata: { reason: 'bank_reconciliation', documents: parsed.data.allocations.length },
    });
    revalidateBanks();
    revalidatePath('/dashboard/treasury/cxc');
    revalidatePath('/dashboard/treasury/cxp');
    return { success: true, data: { payments }, message: payments === 1 ? 'Pago registrado y conciliado' : `${payments} pagos registrados y conciliados` };
  } catch (error) {
    return fail(error, companyId, { lineId });
  }
}

export async function listPaymentCandidatesForLineAction(lineId: string): Promise<ActionResult<OpenPaymentView[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await banksService.listPaymentCandidatesForLine(session.companyId, String(lineId)) };
  } catch (error) {
    return fail(error);
  }
}

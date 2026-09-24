'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma, type Payment } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { registerPaymentSchema } from '../schema';
import * as treasuryService from '../services/treasury.service';
import { emitPaymentEvent } from '../services/movements.service';
import type {
  CashFlowResult,
  CxCSummary,
  CxPSummary,
  PayableRow,
  ReceivableRow,
} from '../services/treasury.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  // Cualquier error de Prisma (incluido ValidationError, que NO es
  // KnownRequestError) se generaliza: sus mensajes exponen nombres de tablas,
  // columnas y fragmentos de query al cliente.
  if (error instanceof Prisma.PrismaClientKnownRequestError) return 'Error al registrar el movimiento';
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

export async function registerSalesPaymentAction(
  salesDocumentId: string,
  input: unknown
): Promise<ActionResult<Payment>> {
  try {
    const session = await requireAuthWithPermission('treasury:write');
    const parsed = registerPaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await treasuryService.registerSalesPayment(session.companyId, salesDocumentId, parsed.data);
    emitPaymentEvent(session.companyId, data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Payment',
      entityId: data.id,
      metadata: { type: 'INCOME', salesDocumentId, amount: data.amount, paymentMethod: data.paymentMethod },
    });
    revalidatePath('/dashboard/sales');
    revalidatePath(`/dashboard/sales/${salesDocumentId}`);
    revalidatePath('/dashboard/treasury/cxc');
    revalidatePath('/dashboard/treasury/cashflow');
    return { success: true, data, message: 'Cobro registrado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function registerPurchasePaymentAction(
  purchaseDocumentId: string,
  input: unknown
): Promise<ActionResult<Payment>> {
  try {
    const session = await requireAuthWithPermission('treasury:write');
    const parsed = registerPaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await treasuryService.registerPurchasePayment(session.companyId, purchaseDocumentId, parsed.data);
    emitPaymentEvent(session.companyId, data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'Payment',
      entityId: data.id,
      metadata: { type: 'EXPENSE', purchaseDocumentId, amount: data.amount, paymentMethod: data.paymentMethod },
    });
    revalidatePath('/dashboard/purchases');
    revalidatePath(`/dashboard/purchases/${purchaseDocumentId}`);
    revalidatePath('/dashboard/treasury/cxp');
    revalidatePath('/dashboard/treasury/cashflow');
    return { success: true, data, message: 'Pago registrado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listReceivablesAction(): Promise<ActionResult<ReceivableRow[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const data = await treasuryService.listReceivables(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listPayablesAction(): Promise<ActionResult<PayableRow[]>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const data = await treasuryService.listPayables(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCxCSummaryAction(): Promise<ActionResult<CxCSummary>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const data = await treasuryService.getCxCSummary(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getCxPSummaryAction(): Promise<ActionResult<CxPSummary>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    const data = await treasuryService.getCxPSummary(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

const cashFlowRangeSchema = z
  .object({ startDate: z.coerce.date(), endDate: z.coerce.date() })
  .refine((r) => r.startDate <= r.endDate, { message: 'La fecha inicial es posterior a la final' });

export async function getCashFlowAction(startDate: string, endDate: string, treasuryAccountId?: string): Promise<ActionResult<CashFlowResult>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    // Sin este parseo, una fecha malformada producía `Invalid Date`, Prisma
    // lanzaba un ValidationError y su mensaje interno terminaba en la UI.
    const parsed = cashFlowRangeSchema.safeParse({ startDate, endDate });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Rango de fechas inválido' };
    }
    // El filtro va siempre junto a `companyId` en la consulta: un id de otra
    // empresa simplemente no devuelve movimientos.
    const accountFilter = typeof treasuryAccountId === 'string' && treasuryAccountId.length > 0 ? treasuryAccountId : undefined;
    const data = await treasuryService.getCashFlow(session.companyId, parsed.data.startDate, parsed.data.endDate, accountFilter);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listPaymentsForSalesDocumentAction(salesDocumentId: string): Promise<ActionResult<Payment[]>> {
  try {
    const session = await requireAuthWithPermission('sales:read');
    const data = await treasuryService.listPaymentsForSalesDocument(session.companyId, salesDocumentId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listPaymentsForPurchaseDocumentAction(purchaseDocumentId: string): Promise<ActionResult<Payment[]>> {
  try {
    const session = await requireAuthWithPermission('purchases:read');
    const data = await treasuryService.listPaymentsForPurchaseDocument(session.companyId, purchaseDocumentId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

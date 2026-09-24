'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type FeeDocument, type Project } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { feeDocumentCreateSchema, markFeeDocumentPaidSchema, listFeeDocumentsFilterSchema } from '../schema';
import * as feesService from '../services/fees.service';
import { emitPaymentEvent } from '@/modules/treasury/services/movements.service';
import type { FeeDocumentWithRelations } from '../services/fees.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return 'Ya existe una boleta con ese folio para este prestador';
  }
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

export async function createFeeDocumentAction(input: unknown): Promise<ActionResult<FeeDocument>> {
  try {
    const session = await requireAuthWithPermission('fees:write');
    const parsed = feeDocumentCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await feesService.createFeeDocument(session.companyId, parsed.data, session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'FeeDocument',
      entityId: data.id,
      metadata: {
        contactId: data.contactId,
        folioNumber: data.folioNumber,
        grossAmount: data.grossAmount,
        retentionAmount: data.retentionAmount,
      },
    });
    revalidatePath('/dashboard/fees');
    return { success: true, data, message: 'Boleta de honorarios registrada correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function markFeeDocumentPaidAction(id: string, input?: unknown): Promise<ActionResult<FeeDocument>> {
  try {
    const session = await requireAuthWithPermission('fees:write');
    const parsed = markFeeDocumentPaidSchema.safeParse(input ?? {});
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const { fee: data, payment } = await feesService.markFeeDocumentPaid(session.companyId, id, parsed.data, session.id);
    emitPaymentEvent(session.companyId, payment);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'FeeDocument',
      entityId: data.id,
      metadata: { paymentStatus: data.paymentStatus, paidAmount: data.paidAmount, paymentId: payment.id },
    });
    revalidatePath('/dashboard/treasury/cashflow');
    revalidatePath('/dashboard/fees');
    revalidatePath(`/dashboard/fees/${id}`);
    return { success: true, data, message: 'Boleta marcada como pagada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function deleteFeeDocumentAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('fees:write');
    await feesService.deleteFeeDocument(session.companyId, id, session.id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'DELETE',
      entity: 'FeeDocument',
      entityId: id,
      metadata: {},
    });
    revalidatePath('/dashboard/fees');
    return { success: true, data: null, message: 'Boleta de honorarios eliminada' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listFeeDocumentsAction(filter?: unknown): Promise<ActionResult<FeeDocumentWithRelations[]>> {
  try {
    const session = await requireAuthWithPermission('fees:read');
    const parsed = listFeeDocumentsFilterSchema.safeParse(filter ?? {});
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Filtro inválido' };
    const data = await feesService.listFeeDocuments(session.companyId, parsed.data);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getFeeDocumentAction(id: string): Promise<ActionResult<FeeDocumentWithRelations>> {
  try {
    const session = await requireAuthWithPermission('fees:read');
    const data = await feesService.getFeeDocument(session.companyId, id);
    if (!data) return { success: false, error: 'Boleta de honorarios no encontrada' };
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

/** Tasa de retención vigente de la empresa, para la vista previa en vivo del formulario de alta. */
export async function getHonorariumRetentionRateAction(): Promise<ActionResult<number>> {
  try {
    const session = await requireAuthWithPermission('fees:read');
    const data = await feesService.getHonorariumRetentionRate(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function listProjectsForFeesAction(): Promise<ActionResult<Project[]>> {
  try {
    const session = await requireAuthWithPermission('fees:read');
    const data = await feesService.listProjectsForSelection(session.companyId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

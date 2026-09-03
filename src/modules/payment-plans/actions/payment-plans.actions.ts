'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, type PaymentPlanInstallment } from '@prisma/client';
import { requireAuthWithPermission, authErrorMessage } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { installmentPaymentSchema, paymentPlanCreateSchema, paymentPlanUpdateSchema } from '../schema';
import * as paymentPlansService from '../services/payment-plans.service';
import type { PaymentPlanWithRelations } from '../services/payment-plans.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function toErrorMessage(error: unknown): string {
  const authMessage = authErrorMessage(error);
  if (authMessage) return authMessage;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return 'Error al guardar el plan de pago';
  if (error instanceof Prisma.PrismaClientValidationError) return 'Datos inválidos para la operación';
  return toFriendlyErrorMessage(error);
}

function revalidatePaymentPlans(id?: string) {
  revalidatePath('/dashboard/payment-plans');
  if (id) revalidatePath(`/dashboard/payment-plans/${id}`);
}

export async function listPaymentPlansAction(contactId?: string): Promise<ActionResult<PaymentPlanWithRelations[]>> {
  try {
    const session = await requireAuthWithPermission('paymentplans:read');
    const data = await paymentPlansService.listPaymentPlans(session.companyId, contactId);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function getPaymentPlanAction(id: string): Promise<ActionResult<PaymentPlanWithRelations>> {
  try {
    const session = await requireAuthWithPermission('paymentplans:read');
    const plan = await paymentPlansService.getPaymentPlan(session.companyId, id);
    if (!plan) return { success: false, error: 'Plan de pago no encontrado' };
    return { success: true, data: plan };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPaymentPlanAction(input: unknown): Promise<ActionResult<PaymentPlanWithRelations>> {
  try {
    const session = await requireAuthWithPermission('paymentplans:write');
    const parsed = paymentPlanCreateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await paymentPlansService.createPaymentPlan(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'PaymentPlan',
      entityId: data.id,
      metadata: {
        contactId: data.contactId,
        candidateId: data.candidateId,
        totalAmount: data.totalAmount,
        installmentCount: data.installmentCount,
      },
    });
    revalidatePaymentPlans();
    return { success: true, data, message: 'Plan de pago creado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function updatePaymentPlanAction(id: string, input: unknown): Promise<ActionResult<PaymentPlanWithRelations>> {
  try {
    const session = await requireAuthWithPermission('paymentplans:write');
    const parsed = paymentPlanUpdateSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await paymentPlansService.updatePaymentPlan(session.companyId, id, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PaymentPlan',
      entityId: data.id,
      metadata: { status: data.status },
    });
    revalidatePaymentPlans(id);
    return { success: true, data, message: 'Plan de pago actualizado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function cancelPaymentPlanAction(id: string): Promise<ActionResult<PaymentPlanWithRelations>> {
  try {
    const session = await requireAuthWithPermission('paymentplans:write');
    const data = await paymentPlansService.cancelPaymentPlan(session.companyId, id);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PaymentPlan',
      entityId: id,
      metadata: { status: 'CANCELLED' },
    });
    revalidatePaymentPlans(id);
    return { success: true, data, message: 'Plan de pago cancelado' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function registerInstallmentPaymentAction(
  installmentId: string,
  planId: string,
  input: unknown
): Promise<ActionResult<PaymentPlanInstallment>> {
  try {
    const session = await requireAuthWithPermission('paymentplans:write');
    const parsed = installmentPaymentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    const data = await paymentPlansService.registerInstallmentPayment(
      session.companyId,
      installmentId,
      parsed.data.amount,
      parsed.data.method,
      parsed.data.date
    );
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'PaymentPlanInstallment',
      entityId: data.id,
      metadata: { amount: parsed.data.amount, method: parsed.data.method, paymentStatus: data.paymentStatus },
    });
    revalidatePaymentPlans(planId);
    return { success: true, data, message: 'Pago de cuota registrado correctamente' };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

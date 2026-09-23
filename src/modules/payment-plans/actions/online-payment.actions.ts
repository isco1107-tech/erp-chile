'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthWithPermission, authErrorMessage, can } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { getAppUrl } from '@/lib/email/mailer';
import { captureException } from '@/lib/observability';
import { khipuCredentialSchema } from '../schema';
import * as onlinePaymentService from '../services/online-payment.service';
import type { OnlinePaymentRow } from '../services/online-payment.service';
import type { OnlinePaymentStatus } from '@prisma/client';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

function portalUrl(token: string): string {
  return `${getAppUrl()}/pagar/${token}`;
}

function failure(error: unknown, fallback: string, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  captureException(error, { module: 'cuotas-pago-en-linea', companyId });
  return { success: false, error: fallback };
}

export interface InstallmentPortalPanelData {
  portalUrl: string | null;
  khipuConfigured: boolean;
  /** Solo quien tiene `settings:company` cambia la cuenta que recibe el dinero. */
  canManageCredential: boolean;
  canWrite: boolean;
}

export async function getInstallmentPortalPanelAction(): Promise<ActionResult<InstallmentPortalPanelData>> {
  try {
    const session = await requireAuthWithPermission('paymentplans:read');
    const config = await onlinePaymentService.getInstallmentPortalConfig(session.companyId);
    return {
      success: true,
      data: {
        portalUrl: config.portalToken ? portalUrl(config.portalToken) : null,
        khipuConfigured: config.khipuConfigured,
        canManageCredential: can(session, 'settings:company'),
        canWrite: can(session, 'paymentplans:write'),
      },
    };
  } catch (error) {
    return failure(error, 'No se pudo cargar la configuración del pago en línea');
  }
}

export async function shareInstallmentPortalAction(): Promise<ActionResult<string>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('paymentplans:write');
    companyId = session.companyId;
    const token = await onlinePaymentService.getOrCreateInstallmentPortalToken(session.companyId);
    revalidatePath('/dashboard/payment-plans');
    return { success: true, data: portalUrl(token) };
  } catch (error) {
    return failure(error, 'No se pudo generar el link del portal de pago', companyId);
  }
}

export async function regenerateInstallmentPortalAction(): Promise<ActionResult<string>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('paymentplans:write');
    companyId = session.companyId;
    const token = await onlinePaymentService.regenerateInstallmentPortalToken(session.companyId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'InstallmentPortal',
      entityId: session.companyId,
      metadata: { change: 'link-regenerado' },
    });
    revalidatePath('/dashboard/payment-plans');
    return { success: true, data: portalUrl(token), message: 'Link regenerado. El anterior dejó de funcionar.' };
  } catch (error) {
    return failure(error, 'No se pudo regenerar el link del portal de pago', companyId);
  }
}

export async function saveKhipuCredentialAction(input: unknown): Promise<ActionResult<{ khipuConfigured: boolean }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const parsed = khipuCredentialSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

    await onlinePaymentService.setKhipuCredential(session.companyId, parsed.data.apiKey);
    // Nunca se audita la llave, solo que cambió.
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: session.companyId,
      metadata: { change: parsed.data.apiKey ? 'khipu-api-key-guardada' : 'khipu-api-key-eliminada' },
    });
    revalidatePath('/dashboard/payment-plans');
    return {
      success: true,
      data: { khipuConfigured: parsed.data.apiKey !== null },
      message: parsed.data.apiKey ? 'Cuenta de Khipu conectada' : 'Pago en línea desactivado',
    };
  } catch (error) {
    return failure(error, 'No se pudo guardar la credencial de Khipu', companyId);
  }
}

export async function listOnlinePaymentsAction(paymentPlanId: string): Promise<ActionResult<OnlinePaymentRow[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('paymentplans:read');
    companyId = session.companyId;
    const data = await onlinePaymentService.listOnlinePaymentsForPlan(session.companyId, paymentPlanId);
    return { success: true, data };
  } catch (error) {
    return failure(error, 'No se pudieron cargar los pagos en línea', companyId);
  }
}

export async function refreshOnlinePaymentAction(orderId: string, paymentPlanId: string): Promise<ActionResult<OnlinePaymentStatus>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('paymentplans:write');
    companyId = session.companyId;
    const status = await onlinePaymentService.refreshOnlinePayment(session.companyId, orderId);
    revalidatePath(`/dashboard/payment-plans/${paymentPlanId}`);
    return { success: true, data: status, message: status === 'PAID' ? 'Pago confirmado por Khipu' : 'Estado actualizado' };
  } catch (error) {
    return failure(error, 'No se pudo consultar el pago en Khipu', companyId);
  }
}

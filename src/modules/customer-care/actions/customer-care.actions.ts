'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { getAppUrl } from '@/lib/email/mailer';
import { closeFollowUpSchema, contactChannelSchema, createSurveySchema, customerCareSettingsSchema, followUpSchema } from '../schema';
import * as service from '../services/customer-care.service';
import type { CustomerCareDashboard, CustomerCareSettingsView, FollowUpRow, InactiveCustomerRow, SurveyRow } from '../services/customer-care.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.CustomerCareError) return { success: false, error: error.message };
  if (!(error instanceof Error)) captureException(error, { module: 'fidelizacion', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidate(): void {
  revalidatePath('/dashboard/customer-care');
}

export async function getCustomerCareDashboardAction(): Promise<ActionResult<CustomerCareDashboard & { settings: CustomerCareSettingsView }>> {
  try {
    const session = await requireAuthWithPermission('customercare:read');
    const [dashboard, settings] = await Promise.all([service.getDashboard(session.companyId), service.getSettings(session.companyId)]);
    return { success: true, data: { ...dashboard, settings } };
  } catch (error) {
    return fail(error);
  }
}

export async function listInactiveCustomersAction(): Promise<ActionResult<InactiveCustomerRow[]>> {
  try {
    const session = await requireAuthWithPermission('customercare:read');
    return { success: true, data: await service.getInactiveCustomerRows(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function listFollowUpsAction(status: string = 'OPEN'): Promise<ActionResult<FollowUpRow[]>> {
  try {
    const session = await requireAuthWithPermission('customercare:read');
    const safe = status === 'DONE' || status === 'SKIPPED' || status === 'ALL' ? status : 'OPEN';
    return { success: true, data: await service.listFollowUps(session.companyId, safe) };
  } catch (error) {
    return fail(error);
  }
}

export async function listSurveysAction(): Promise<ActionResult<Array<SurveyRow & { url: string }>>> {
  try {
    const session = await requireAuthWithPermission('customercare:read');
    const rows = await service.listSurveys(session.companyId);
    const base = getAppUrl();
    return { success: true, data: rows.map((r) => ({ ...r, url: `${base}/encuesta/${r.token}` })) };
  } catch (error) {
    return fail(error);
  }
}

export async function listCustomerOptionsAction(): Promise<ActionResult<Array<{ id: string; name: string }>>> {
  try {
    const session = await requireAuthWithPermission('customercare:read');
    return { success: true, data: await service.listCustomerOptions(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function createSurveyAction(input: unknown): Promise<ActionResult<{ id: string; url: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('customercare:write');
    companyId = session.companyId;
    const parsed = createSurveySchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await service.createSurvey(session.companyId, session.id, parsed.data.contactId, parsed.data.salesDocumentId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'CustomerSurvey', entityId: created.id, metadata: { contactId: parsed.data.contactId } });
    revalidate();
    return { success: true, data: { id: created.id, url: `${getAppUrl()}/encuesta/${created.token}` }, message: 'Enlace de encuesta creado' };
  } catch (error) {
    return fail(error, companyId, { action: 'createSurvey' });
  }
}

export async function markSurveySentAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('customercare:write');
    await service.markSurveySent(session.companyId, String(id));
    revalidate();
    return { success: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function setContactChannelAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('customercare:write');
    companyId = session.companyId;
    const parsed = contactChannelSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.setContactChannel(session.companyId, parsed.data.contactId, parsed.data.channel, parsed.data.note);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'CustomerCareSettings', entityId: parsed.data.contactId, metadata: { channel: parsed.data.channel } });
    revalidate();
    return { success: true, data: null, message: 'Canal registrado' };
  } catch (error) {
    return fail(error, companyId, { action: 'setContactChannel' });
  }
}

export async function createFollowUpAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('customercare:write');
    companyId = session.companyId;
    const parsed = followUpSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const created = await service.createFollowUp(session.companyId, session.id, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'CustomerFollowUp', entityId: created.id, metadata: { contactId: parsed.data.contactId, reason: parsed.data.reason } });
    revalidate();
    return { success: true, data: created, message: 'Seguimiento creado' };
  } catch (error) {
    return fail(error, companyId, { action: 'createFollowUp' });
  }
}

export async function generateInactiveFollowUpsAction(): Promise<ActionResult<{ created: number }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('customercare:write');
    companyId = session.companyId;
    const created = await service.generateInactiveFollowUps(session.companyId, session.id);
    if (created > 0) {
      await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'CustomerFollowUp', entityId: 'batch', metadata: { generated: created, reason: 'INACTIVE' } });
    }
    revalidate();
    return {
      success: true,
      data: { created },
      message: created === 0 ? 'No hay clientes inactivos nuevos: todos ya tienen un seguimiento abierto' : `Se crearon ${created} seguimiento${created === 1 ? '' : 's'}`,
    };
  } catch (error) {
    return fail(error, companyId, { action: 'generateInactiveFollowUps' });
  }
}

export async function closeFollowUpAction(id: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('customercare:write');
    companyId = session.companyId;
    const parsed = closeFollowUpSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.closeFollowUp(session.companyId, String(id), parsed.data.status, parsed.data.outcome);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'CustomerFollowUp', entityId: String(id), metadata: { status: parsed.data.status } });
    revalidate();
    return { success: true, data: null, message: parsed.data.status === 'DONE' ? 'Seguimiento cerrado' : 'Seguimiento descartado' };
  } catch (error) {
    return fail(error, companyId, { action: 'closeFollowUp' });
  }
}

export async function saveCustomerCareSettingsAction(input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('customercare:write');
    companyId = session.companyId;
    const parsed = customerCareSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.saveSettings(session.companyId, parsed.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'CustomerCareSettings', entityId: session.companyId, metadata: { inactiveAfterDays: parsed.data.inactiveAfterDays } });
    revalidate();
    return { success: true, data: null, message: 'Configuración guardada' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveCustomerCareSettings' });
  }
}

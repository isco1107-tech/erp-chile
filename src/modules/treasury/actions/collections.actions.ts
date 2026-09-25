'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, getAuthContext, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { captureException } from '@/lib/observability';
import { collectionNoteSchema, collectionSettingsSchema } from '../schema';
import * as collectionsService from '../services/collections.service';
import type { CollectionSettings, CollectionsOverview, CustomerCollectionDetail } from '../services/collections.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (!(error instanceof Error)) captureException(error, { module: 'cobranza', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

export async function getCollectionsOverviewAction(): Promise<ActionResult<CollectionsOverview>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await collectionsService.getCollectionsOverview(session.companyId, new Date()) };
  } catch (error) {
    return fail(error);
  }
}

export async function getCustomerCollectionDetailAction(contactId: string): Promise<ActionResult<CustomerCollectionDetail>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await collectionsService.getCustomerCollectionDetail(session.companyId, String(contactId), new Date()) };
  } catch (error) {
    return fail(error);
  }
}

export async function addCollectionNoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = collectionNoteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const context = await getAuthContext();
    const note = await collectionsService.addCollectionNote(session.companyId, { id: session.id, name: context.name ?? session.email }, {
      ...parsed.data,
      salesDocumentId: parsed.data.salesDocumentId || undefined,
      promiseDate: parsed.data.promiseDate || undefined,
    });
    revalidatePath('/dashboard/treasury/collections');
    return { success: true, data: { id: note.id }, message: 'Gestión registrada' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function setRemindersPausedAction(contactId: string, paused: boolean): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    await collectionsService.setContactRemindersPaused(session.companyId, String(contactId), Boolean(paused));
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'Contact',
      entityId: String(contactId),
      metadata: { collectionRemindersPaused: Boolean(paused) },
    });
    revalidatePath('/dashboard/treasury/collections');
    return { success: true, data: null, message: paused ? 'Recordatorios automáticos pausados para este cliente' : 'Recordatorios automáticos reactivados' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function getCollectionSettingsAction(): Promise<ActionResult<CollectionSettings>> {
  try {
    const session = await requireAuthWithPermission('treasury:read');
    return { success: true, data: await collectionsService.getCollectionSettings(session.companyId) };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCollectionSettingsAction(input: unknown): Promise<ActionResult<CollectionSettings>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('treasury:write');
    companyId = session.companyId;
    const parsed = collectionSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const data = await collectionsService.updateCollectionSettings(session.companyId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'CompanySettings',
      entityId: session.companyId,
      metadata: { collectionRemindersEnabled: data.enabled, collectionReminderDays: data.days },
    });
    revalidatePath('/dashboard/treasury/collections');
    return { success: true, data, message: data.enabled ? 'Cobranza automática activada' : 'Cobranza automática desactivada' };
  } catch (error) {
    return fail(error, companyId);
  }
}

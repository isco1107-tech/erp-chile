'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { getAppUrl } from '@/lib/email/mailer';
import * as portal from '../services/customer-portal.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof portal.CustomerPortalError) return { success: false, error: error.message };
  captureException(error, { module: 'portal-clientes', companyId });
  return { success: false, error: 'No se pudo completar la operación con el portal del cliente' };
}

/**
 * Genera el enlace del portal del cliente. Un enlace nuevo reemplaza al
 * anterior (que deja de funcionar al instante); el enlace en claro se
 * devuelve solo esta vez.
 */
export async function createCustomerPortalLinkAction(contactId: string): Promise<ActionResult<{ url: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('contacts:write');
    companyId = session.companyId;
    const { token } = await portal.createCustomerPortalLink(session.companyId, contactId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Contact', entityId: contactId, metadata: { customerPortal: 'link-created' } });
    revalidatePath(`/dashboard/contacts/${contactId}`);
    return { success: true, data: { url: `${getAppUrl()}/cliente/${token}` }, message: 'Enlace del portal generado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function revokeCustomerPortalLinkAction(contactId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('contacts:write');
    companyId = session.companyId;
    await portal.revokeCustomerPortalLink(session.companyId, contactId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Contact', entityId: contactId, metadata: { customerPortal: 'link-revoked' } });
    revalidatePath(`/dashboard/contacts/${contactId}`);
    return { success: true, data: null, message: 'Portal desactivado: el enlace dejó de funcionar' };
  } catch (error) {
    return fail(error, companyId);
  }
}

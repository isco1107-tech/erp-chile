'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { getAppUrl } from '@/lib/email/mailer';
import * as portal from '../services/supplier-portal.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof portal.SupplierPortalError) return { success: false, error: error.message };
  captureException(error, { module: 'portal-proveedores', companyId });
  return { success: false, error: 'No se pudo completar la operación con el portal del proveedor' };
}

/**
 * Dar acceso a un proveedor a su inventario es entregarle datos de la empresa a un tercero:
 * lo decide quien administra la empresa (`settings:company`), como las demás integraciones externas.
 */
const PERMISSION = 'settings:company' as const;

/**
 * Genera el código del proveedor. Uno nuevo reemplaza al anterior (que deja de funcionar al
 * instante); el código en claro se devuelve solo esta vez.
 */
export async function createSupplierPortalCodeAction(contactId: string): Promise<ActionResult<{ code: string; url: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(PERMISSION);
    companyId = session.companyId;
    const { code } = await portal.generateSupplierPortalCode(session.companyId, contactId, session.id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Contact', entityId: contactId, metadata: { supplierPortal: 'code-created' } });
    revalidatePath(`/dashboard/contacts/${contactId}`);
    return { success: true, data: { code, url: `${getAppUrl()}/proveedor/${code}` }, message: 'Código del proveedor generado' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function revokeSupplierPortalAction(contactId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(PERMISSION);
    companyId = session.companyId;
    await portal.revokeSupplierPortalAccess(session.companyId, contactId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Contact', entityId: contactId, metadata: { supplierPortal: 'access-revoked' } });
    revalidatePath(`/dashboard/contacts/${contactId}`);
    return { success: true, data: null, message: 'Acceso desactivado: el código dejó de funcionar' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function setSupplierPortalMovementAction(contactId: string, showMovement: boolean): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(PERMISSION);
    companyId = session.companyId;
    await portal.setSupplierPortalMovement(session.companyId, contactId, Boolean(showMovement));
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Contact', entityId: contactId, metadata: { supplierPortal: 'movement', showMovement: Boolean(showMovement) } });
    revalidatePath(`/dashboard/contacts/${contactId}`);
    return { success: true, data: null, message: showMovement ? 'El proveedor verá también lo que sale' : 'El proveedor verá solo las existencias' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function linkSupplierProductAction(contactId: string, productId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(PERMISSION);
    companyId = session.companyId;
    await portal.linkSupplierProduct(session.companyId, contactId, productId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Contact', entityId: contactId, metadata: { supplierPortal: 'product-linked', productId } });
    revalidatePath(`/dashboard/contacts/${contactId}`);
    return { success: true, data: null, message: 'Producto agregado a la lista del proveedor' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function unlinkSupplierProductAction(contactId: string, productId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(PERMISSION);
    companyId = session.companyId;
    await portal.unlinkSupplierProduct(session.companyId, contactId, productId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'Contact', entityId: contactId, metadata: { supplierPortal: 'product-unlinked', productId } });
    revalidatePath(`/dashboard/contacts/${contactId}`);
    return { success: true, data: null, message: 'Producto quitado de la lista del proveedor' };
  } catch (error) {
    return fail(error, companyId);
  }
}

export async function searchSupplierProductsAction(contactId: string, query: string): Promise<ActionResult<Array<{ id: string; sku: string; name: string }>>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(PERMISSION);
    companyId = session.companyId;
    return { success: true, data: await portal.searchLinkableProducts(session.companyId, contactId, String(query ?? '')) };
  } catch (error) {
    return fail(error, companyId);
  }
}

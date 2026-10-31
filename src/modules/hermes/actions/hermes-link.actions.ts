'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { prisma } from '@/lib/prisma';
import * as hermesLink from '../services/hermes-link.service';

type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

export type HermesLinkView = hermesLink.HermesLinkStatus & { warehouses: { id: string; name: string }[] };

function fail(error: unknown, step: string, companyId?: string): ActionResult<never> {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof hermesLink.HermesLinkError) return { success: false, error: error.message };
  captureException(error, { module: 'hermes', ...(companyId ? { companyId } : {}), extra: { step } });
  return { success: false, error: 'No se pudo guardar la conexión con Hermes' };
}

export async function getHermesLinkAction(): Promise<ActionResult<HermesLinkView>> {
  try {
    const session = await requireAuthWithPermission('settings:company');
    const [status, warehouses] = await Promise.all([
      hermesLink.getHermesLinkStatus(session.companyId),
      prisma.warehouse.findMany({ where: { companyId: session.companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return { success: true, data: { ...status, warehouses } };
  } catch (error) {
    return fail(error, 'get');
  }
}

/** Genera o regenera la llave (la anterior deja de servir al instante). La llave se devuelve UNA vez. */
export async function issueHermesKeyAction(warehouseId: string): Promise<ActionResult<string>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const key = await hermesLink.issueHermesKey(session.companyId, warehouseId, session.id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'HermesLink', entityId: session.companyId, metadata: { op: 'issue-key', warehouseId } });
    revalidatePath('/dashboard/settings/company');
    return { success: true, data: key, message: 'Llave generada: cópiala ahora, no se vuelve a mostrar' };
  } catch (error) {
    return fail(error, 'issue', companyId);
  }
}

export async function changeHermesWarehouseAction(warehouseId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    await hermesLink.changeHermesWarehouse(session.companyId, warehouseId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'HermesLink', entityId: session.companyId, metadata: { op: 'warehouse', warehouseId } });
    revalidatePath('/dashboard/settings/company');
    return { success: true, data: null, message: 'Bodega actualizada' };
  } catch (error) {
    return fail(error, 'warehouse', companyId);
  }
}

export async function revokeHermesKeyAction(): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    await hermesLink.revokeHermesKey(session.companyId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'HermesLink', entityId: session.companyId, metadata: { op: 'revoke' } });
    revalidatePath('/dashboard/settings/company');
    return { success: true, data: null, message: 'Conexión con Hermes desactivada' };
  } catch (error) {
    return fail(error, 'revoke', companyId);
  }
}

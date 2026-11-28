'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import {
  DefaultDomainError,
  checkDefaultDomainDns,
  getDefaultDomainView,
  removeDefaultDomain,
  setDefaultDomain,
  type DefaultDomainView,
} from '@/lib/hosting/default-domain.service';

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

/**
 * Dominio predeterminado de la empresa (Configuración → Perfil de Empresa): el que ya
 * compró y con el que nacen sus páginas nuevas. Es configuración de la empresa
 * (`settings:company`, Dueños y Administradores): cambia la dirección pública de todo lo que
 * se cree después, pero NO toca las páginas que ya existen ni sus dominios.
 */

function failure(error: unknown, companyId: string | undefined, action: string, fallback: string): ActionResult<never> {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof DefaultDomainError) return { success: false, error: error.message };
  captureException(error, { module: 'dominios', companyId, extra: { action } });
  return { success: false, error: fallback };
}

async function audit(session: { companyId: string; id: string; email: string }, domain: string | null): Promise<void> {
  const settings = await prisma.companySettings.findFirst({ where: { companyId: session.companyId }, select: { id: true } });
  await createAuditLog({
    companyId: session.companyId,
    userId: session.id,
    userEmail: session.email,
    action: 'UPDATE',
    entity: 'CompanySettings',
    entityId: settings?.id ?? session.companyId,
    metadata: { changes: { defaultDomain: domain } },
  });
}

export async function getDefaultDomainAction(): Promise<ActionResult<DefaultDomainView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    return { success: true, data: await getDefaultDomainView(session.companyId) };
  } catch (error) {
    return failure(error, companyId, 'getDefaultDomain', 'No se pudo leer el dominio predeterminado');
  }
}

export async function setDefaultDomainAction(domain: unknown): Promise<ActionResult<DefaultDomainView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    if (typeof domain !== 'string') return { success: false, error: 'Escribe el dominio, por ejemplo miempresa.cl' };
    const data = await setDefaultDomain(session.companyId, domain);
    await audit(session, data.domain);
    revalidatePath('/dashboard/settings/company');
    return { success: true, data, message: 'Dominio guardado. Las páginas que crees desde ahora nacerán en él.' };
  } catch (error) {
    return failure(error, companyId, 'setDefaultDomain', 'No se pudo guardar el dominio predeterminado');
  }
}

export async function removeDefaultDomainAction(): Promise<ActionResult<DefaultDomainView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    const data = await removeDefaultDomain(session.companyId);
    await audit(session, null);
    revalidatePath('/dashboard/settings/company');
    return { success: true, data, message: 'Dominio quitado. Las páginas ya creadas conservan el suyo y las nuevas nacerán en la dirección de la plataforma.' };
  } catch (error) {
    return failure(error, companyId, 'removeDefaultDomain', 'No se pudo quitar el dominio predeterminado');
  }
}

/** Revisa en el DNS público si el registro de comodín ya apunta a la plataforma. */
export async function checkDefaultDomainAction(): Promise<ActionResult<{ domain: string; dnsOk: boolean }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('settings:company');
    companyId = session.companyId;
    return { success: true, data: await checkDefaultDomainDns(session.companyId) };
  } catch (error) {
    return failure(error, companyId, 'checkDefaultDomain', 'No se pudo revisar el DNS del dominio');
  }
}

'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { webSiteDomainSchema } from '@/modules/web-sites/schema';
import * as domains from '@/modules/web-sites/services/web-site-domain.service';
import { StoreError } from '../errors';
import { assertStoreModule } from '../services/store-settings.service';
import { createStorefront, storefrontSchema, getStoreBrand, storeBrandSchema, updateStoreBrand } from '../services/store-workspace.service';
import type { ActionResult } from './store.actions';

async function run<T>(task: (session: Awaited<ReturnType<typeof requireAuthWithPermission>>) => Promise<T>, write = true): Promise<ActionResult<T>> {
  try {
    const session = await requireAuthWithPermission(write ? 'store:manage' : 'store:read');
    await assertStoreModule(session.companyId);
    const data = await task(session);
    if (write) revalidatePath('/dashboard/store');
    return { success: true, data };
  } catch (error) {
    const safe = authErrorMessage(error);
    if (safe) return { success: false, error: safe };
    if (error instanceof StoreError || error instanceof domains.WebSiteDomainError) return { success: false, error: error.message };
    captureException(error, { module: 'ecommerce' });
    return { success: false, error: 'No pudimos completar el cambio. Inténtalo de nuevo.' };
  }
}

export async function createStorefrontAction(input: unknown, domain?: string) {
  return run(async (session) => {
    const parsed = storefrontSchema.safeParse(input);
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
    const parsedDomain = domain?.trim() ? webSiteDomainSchema.safeParse({ domain }) : null;
    if (parsedDomain && !parsedDomain.success) throw new StoreError(parsedDomain.error.issues[0]?.message ?? 'Revisa el dominio');
    const site = await createStorefront(session.companyId, session.name, parsed.data);
    let notice: string | null = null;
    if (parsedDomain?.success) {
      try {
        await domains.setWebSiteDomain(session.companyId, site.id, parsedDomain.data.domain);
      } catch {
        notice = 'La tienda se creó. Conecta o corrige el dominio desde Diseño y dominio.';
      }
    }
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'CREATE',
      entity: 'WebSiteStore',
      entityId: site.id,
      metadata: { action: 'create-storefront', slug: site.slug },
    });
    return { ...site, notice };
  });
}
export async function getStoreBrandAction(siteId: string) {
  return run((session) => getStoreBrand(session.companyId, siteId), false);
}
export async function updateStoreBrandAction(siteId: string, input: unknown) {
  return run(async (session) => {
    const parsed = storeBrandSchema.safeParse(input);
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
    const result = await updateStoreBrand(session.companyId, siteId, parsed.data);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'WebSiteStore',
      entityId: siteId,
      metadata: { action: 'update-store-brand' },
    });
    revalidatePath(`/web/${result.slug}`, 'layout');
    return result;
  });
}
export async function getStoreDomainAction(siteId: string) {
  return run(async (session) => {
    await getStoreBrand(session.companyId, siteId);
    return domains.refreshWebSiteDomain(session.companyId, siteId);
  });
}
export async function setStoreDomainAction(siteId: string, domain: string) {
  return run(async (session) => {
    await getStoreBrand(session.companyId, siteId);
    const parsed = webSiteDomainSchema.safeParse({ domain });
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message ?? 'Revisa el dominio');
    const view = await domains.setWebSiteDomain(session.companyId, siteId, parsed.data.domain);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'WebSiteStore',
      entityId: siteId,
      metadata: { action: 'set-domain', domain: view.domain },
    });
    return view;
  });
}
export async function removeStoreDomainAction(siteId: string) {
  return run(async (session) => {
    await getStoreBrand(session.companyId, siteId);
    const view = await domains.removeWebSiteDomain(session.companyId, siteId);
    await createAuditLog({
      companyId: session.companyId,
      userId: session.id,
      userEmail: session.email,
      action: 'UPDATE',
      entity: 'WebSiteStore',
      entityId: siteId,
      metadata: { action: 'remove-domain' },
    });
    return view;
  });
}

'use server';

import { revalidatePath } from 'next/cache';
import { authErrorMessage, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { prisma } from '@/lib/prisma';
import { captureException } from '@/lib/observability';
import { del } from '@/lib/storage/blob';
import { siteForms } from '@/lib/web-sites/site-forms';
import { DESTINATION_INFO } from '@/lib/web-sites/forms';
import {
  saveWebSiteContentSchema,
  webSiteSettingsSchema,
  webSiteAssetAltSchema,
  messageFilterSchema,
  routeDestinationSchema,
} from '@/modules/web-sites/schema';
import * as publishing from '@/modules/web-sites/services/web-sites.service';
import * as forms from '@/modules/web-sites/services/web-site-forms.service';
import { assertStoreModule } from '../services/store-settings.service';
import { listPublicProducts, resolveStoreForOrders } from '../services/store-public.service';
import { StoreError } from '../errors';
import type { ActionResult } from './store.actions';

/** The publishing engine is shared; permissions and resources always belong to Ecommerce. */
async function run<T>(write: boolean, task: (session: Awaited<ReturnType<typeof requireAuthWithPermission>>) => Promise<T>): Promise<ActionResult<T>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission(write ? 'store:manage' : 'store:read');
    companyId = session.companyId;
    await assertStoreModule(companyId);
    const data = await task(session);
    if (write) revalidatePath('/dashboard/store', 'layout');
    return { success: true, data };
  } catch (error) {
    const auth = authErrorMessage(error);
    if (auth) return { success: false, error: auth };
    if (error instanceof StoreError || error instanceof publishing.WebSiteError || error instanceof forms.FormRoutingError)
      return { success: false, error: error.message };
    captureException(error, { module: 'ecommerce', companyId, extra: { action: 'storefront-editor' } });
    return { success: false, error: 'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.' };
  }
}

export async function getStoreEditorAction(siteId: string) {
  return run(false, async (session) => {
    const store = await assertStorefront(session.companyId, siteId);
    const site = await publishing.getWebSite(session.companyId, siteId);
    if (!site) throw new StoreError('Tienda no encontrada', 404);
    return { ...site, status: store.homepageEnabled ? ('PUBLISHED' as const) : ('DRAFT' as const) };
  });
}

export async function saveStoreContentAction(siteId: string, input: unknown) {
  return run(true, async (session) => {
    await assertStorefront(session.companyId, siteId);
    const parsed = saveWebSiteContentSchema.safeParse(input);
    if (!parsed.success) throw new StoreError('Revisa las páginas y sus secciones: hay datos que no son válidos.');
    if (parsed.data.html !== undefined) throw new StoreError('El creador Ecommerce utiliza secciones seguras para integrar las compras.');
    return publishing.saveWebSiteContent(session.companyId, siteId, parsed.data);
  });
}

export async function updateStorePageSettingsAction(siteId: string, input: unknown) {
  return run(true, async (session) => {
    await assertStorefront(session.companyId, siteId);
    const parsed = webSiteSettingsSchema.safeParse(input);
    if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message ?? 'Revisa los ajustes');
    const before = await publishing.getWebSite(session.companyId, siteId);
    if (before && parsed.data.slug !== before.slug && (await prisma.storeOrder.count({ where: { companyId: session.companyId, siteId } })) > 0)
      throw new StoreError('Esta tienda ya tiene pedidos: conserva su dirección para que los enlaces de seguimiento y pago sigan funcionando.');
    // Customer associations are a website-agency tool, not a way to attach another tenant's store.
    if (parsed.data.contactId && parsed.data.contactId !== before?.contactId) throw new StoreError('La tienda pertenece a tu empresa.');
    const result = await publishing.updateWebSiteSettings(session.companyId, siteId, { ...parsed.data, contactId: before?.contactId ?? null });
    await audit(session, siteId, 'store-page-settings');
    if (before) revalidatePath(`/web/${before.slug}`, 'layout');
    revalidatePath(`/web/${result.slug}`, 'layout');
    return result;
  });
}

export async function publishStorePagesAction(siteId: string) {
  return run(true, async (session) => {
    await assertStorefront(session.companyId, siteId);
    const site = await publishing.getWebSite(session.companyId, siteId);
    if (!site) throw new StoreError('Tienda no encontrada', 404);
    for (const form of siteForms(site.document).filter((entry) => !entry.hidden)) {
      const info = DESTINATION_INFO[form.destination];
      if (info.feature && session.features[info.feature] && info.publishPermission && !can(session, info.publishPermission))
        throw new StoreError(`No puedes publicar el formulario «${form.title}» hacia «${info.label}»: necesitas el permiso de crear registros en ese destino.`);
    }
    const result = await publishing.publishWebSite(session.companyId, siteId, session.features);
    await prisma.webSiteStore.updateMany({ where: { companyId: session.companyId, siteId, standalone: true }, data: { homepageEnabled: true } });
    await audit(session, siteId, 'publish-store-pages');
    revalidatePath(`/web/${site.slug}`, 'layout');
    return { publishedAt: result.publishedAt.toISOString(), report: result.report };
  });
}

export async function hideStorePagesAction(siteId: string) {
  return run(true, async (session) => {
    await assertStorefront(session.companyId, siteId);
    await prisma.webSiteStore.updateMany({ where: { companyId: session.companyId, siteId, standalone: true }, data: { homepageEnabled: false } });
    const site = await prisma.webSite.findFirst({ where: { companyId: session.companyId, id: siteId }, select: { slug: true } });
    if (site) revalidatePath(`/web/${site.slug}`, 'layout');
    await audit(session, siteId, 'hide-store-pages');
    // Preserve the published commerce resource: existing orders, checkout and payments keep their lifecycle.
    return null;
  });
}

export async function previewStoreProductsAction(siteId: string, query: { collection?: string; featuredOnly?: boolean; limit?: number }) {
  return run(false, async (session) => {
    await assertStorefront(session.companyId, siteId);
    const site = await prisma.webSite.findFirstOrThrow({ where: { id: siteId, companyId: session.companyId }, select: { slug: true } });
    const ctx = await resolveStoreForOrders(site.slug);
    if (!ctx) throw new StoreError('La tienda no está disponible para vista previa.');
    return listPublicProducts(ctx, {
      collection: query.collection?.slice(0, 80),
      featuredOnly: query.featuredOnly === true,
      limit: Math.max(1, Math.min(24, Math.floor(query.limit || 8))),
    });
  });
}

export async function listStoreDesignProductsAction(q?: string) {
  return run(false, (session) => publishing.listCatalogProducts(session.companyId, q?.slice(0, 100)));
}

export async function updateStoreAssetAltAction(assetId: string, input: unknown) {
  return run(true, async (session) => {
    const asset = await ownAsset(session.companyId, assetId);
    await assertStorefront(session.companyId, asset.siteId);
    const parsed = webSiteAssetAltSchema.safeParse(input);
    if (!parsed.success) throw new StoreError('La descripción de la imagen es demasiado larga.');
    await publishing.updateAssetAlt(session.companyId, assetId, parsed.data.alt);
    return null;
  });
}
export async function deleteStoreAssetAction(assetId: string) {
  return run(true, async (session) => {
    const asset = await ownAsset(session.companyId, assetId);
    await assertStorefront(session.companyId, asset.siteId);
    const [listed, product] = await Promise.all([
      prisma.storeProduct.findFirst({ where: { companyId: session.companyId, images: { array_contains: [{ url: asset.url }] } }, select: { id: true } }),
      prisma.product.findFirst({ where: { companyId: session.companyId, imageUrl: asset.url }, select: { id: true } }),
    ]);
    if (listed || product) throw new StoreError('Esta imagen se usa en un producto. Quítala de su ficha antes de eliminarla.');
    const { urlToDelete } = await publishing.deleteAsset(session.companyId, assetId);
    if (urlToDelete) await del(urlToDelete).catch((error) => captureException(error, { module: 'ecommerce', companyId: session.companyId }));
    await audit(session, asset.siteId, 'delete-store-asset');
    return null;
  });
}

export async function listStoreFormMessagesAction(input: unknown) {
  return run(false, async (session) => {
    const parsed = messageFilterSchema.safeParse(input);
    if (!parsed.success || !parsed.data.siteId) throw new StoreError('Elige la tienda de la bandeja.');
    await assertStorefront(session.companyId, parsed.data.siteId);
    const result = await forms.listFormMessages(session.companyId, parsed.data);
    return { ...result, sites: result.sites.filter((site) => site.id === parsed.data.siteId) };
  });
}
export async function setStoreMessageReadAction(messageId: string, read: boolean) {
  return run(true, async (session) => {
    await ownMessage(session.companyId, messageId);
    await publishing.setMessageRead(session.companyId, messageId, read);
    return null;
  });
}
export async function setStoreMessageArchivedAction(messageId: string, archived: boolean) {
  return run(true, async (session) => {
    await ownMessage(session.companyId, messageId);
    await forms.setMessageArchived(session.companyId, messageId, archived);
    return null;
  });
}
export async function deleteStoreMessageAction(messageId: string) {
  return run(true, async (session) => {
    await ownMessage(session.companyId, messageId);
    await publishing.deleteWebSiteMessage(session.companyId, messageId);
    return null;
  });
}
export async function markStoreMessagesReadAction(input: unknown) {
  return run(true, async (session) => {
    const parsed = messageFilterSchema.safeParse(input);
    if (!parsed.success || !parsed.data.siteId) throw new StoreError('Elige la tienda.');
    await assertStorefront(session.companyId, parsed.data.siteId);
    return { count: await forms.markAllRead(session.companyId, parsed.data) };
  });
}
export async function routeStoreMessageAction(messageId: string, destination: string) {
  return run(true, async (session) => {
    await ownMessage(session.companyId, messageId);
    const parsed = routeDestinationSchema.safeParse(destination);
    if (!parsed.success) throw new StoreError('Destino inválido');
    const info = DESTINATION_INFO[parsed.data];
    if (info.feature && !session.features[info.feature]) throw new StoreError(`Tu plan no incluye ${info.area}.`);
    if (info.routePermission && !can(session, info.routePermission)) throw new StoreError('No tienes permiso para crear registros en ese destino.');
    const result = await forms.routeExistingMessage({ companyId: session.companyId, userId: session.id, features: session.features }, messageId, parsed.data);
    await audit(session, messageId, 'route-store-form-message');
    return { ...result, kind: result.kind };
  });
}
export async function listStoreAcademyGroupNamesAction() {
  return run(true, async (session) => {
    if (!can(session, 'academy:read') || !session.features.hasAcademy) throw new StoreError('No tienes acceso a los grupos de la academia.');
    const groups = await prisma.academyGroup.findMany({
      where: { companyId: session.companyId, isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
      take: 500,
    });
    return groups.map((group) => group.name);
  });
}

async function assertStorefront(companyId: string, siteId: string) {
  const store = await prisma.webSiteStore.findFirst({
    where: { companyId, siteId, standalone: true, site: { companyId, mode: 'GUIDED', status: { not: 'ARCHIVED' } } },
    select: { homepageEnabled: true },
  });
  if (!store) throw new StoreError('Tienda independiente no encontrada. El creador de sitios informativos se administra por separado.', 404);
  return store;
}
async function ownAsset(companyId: string, assetId: string) {
  const asset = await prisma.webSiteAsset.findFirst({ where: { id: assetId, companyId }, select: { siteId: true, url: true } });
  if (!asset) throw new StoreError('Imagen no encontrada', 404);
  return asset;
}
async function ownMessage(companyId: string, messageId: string) {
  const message = await prisma.webSiteMessage.findFirst({ where: { id: messageId, companyId }, select: { siteId: true } });
  if (!message) throw new StoreError('Mensaje no encontrado', 404);
  await assertStorefront(companyId, message.siteId);
}
async function audit(session: Awaited<ReturnType<typeof requireAuthWithPermission>>, entityId: string, event: string) {
  await createAuditLog({
    companyId: session.companyId,
    userId: session.id,
    userEmail: session.email,
    action: 'UPDATE',
    entity: 'WebSiteStore',
    entityId,
    metadata: { event },
  });
}

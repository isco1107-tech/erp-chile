'use server';

import { revalidatePath } from 'next/cache';
import type { WebSiteStatus } from '@prisma/client';
import { authErrorMessage, can, requireAuthWithPermission } from '@/lib/auth/guards';
import { createAuditLog } from '@/lib/auth/audit';
import { captureException } from '@/lib/observability';
import { toFriendlyErrorMessage } from '@/lib/prisma-errors';
import { del } from '@/lib/storage/blob';
import { DESTINATION_INFO, type FormDestination } from '@/lib/web-sites/forms';
import type { ReadinessReport } from '@/lib/web-sites/readiness';
import { siteForms } from '@/lib/web-sites/site-forms';
import { prisma } from '@/lib/prisma';
import { catalogProductsQuerySchema, createWebSiteSchema, messageFilterSchema, routeDestinationSchema, saveWebSiteContentSchema, webSiteAssetAltSchema, webSiteDomainSchema, webSiteSettingsSchema } from '../schema';
import * as service from '../services/web-sites.service';
import * as domains from '../services/web-site-domain.service';
import * as forms from '../services/web-site-forms.service';
import type { WebSiteDetail, WebSiteRow } from '../services/web-sites.service';
import type { WebSiteDomainView } from '../services/web-site-domain.service';
import type { FormMessagesPage } from '../services/web-site-forms.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

function fail(error: unknown, companyId?: string, extra?: Record<string, unknown>): { success: false; error: string } {
  const authMessage = authErrorMessage(error);
  if (authMessage) return { success: false, error: authMessage };
  if (error instanceof service.WebSiteError || error instanceof domains.WebSiteDomainError || error instanceof forms.FormRoutingError) return { success: false, error: error.message };
  captureException(error, { module: 'sitios-web', companyId, extra });
  return { success: false, error: toFriendlyErrorMessage(error) };
}

function revalidateSite(id?: string): void {
  revalidatePath('/dashboard/web-sites');
  if (id) revalidatePath(`/dashboard/web-sites/${id}`);
}

/** Vacía de la caché la página pública, sus páginas internas y su documento HTML. */
function revalidatePublic(slug: string): void {
  revalidatePath(`/web/${slug}`);
  revalidatePath(`/web/${slug}/raw`);
  // Páginas internas (`/web/<slug>/<página>`): sus direcciones cambian con el contenido, así que se vacía el patrón completo.
  revalidatePath('/web/[slug]/[page]', 'page');
}

const STATUS_FILTERS = ['ALL', 'DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export async function listWebSitesAction(status: string = 'ALL', q?: string): Promise<ActionResult<{ rows: WebSiteRow[]; counts: Record<string, number> }>> {
  try {
    const session = await requireAuthWithPermission('websites:read');
    const safe = (STATUS_FILTERS as readonly string[]).includes(status) ? (status as WebSiteStatus | 'ALL') : 'ALL';
    return { success: true, data: await service.listWebSites(session.companyId, { status: safe, q: q?.slice(0, 100) }) };
  } catch (error) {
    return fail(error);
  }
}

export async function getWebSiteAction(id: string): Promise<ActionResult<WebSiteDetail>> {
  try {
    const session = await requireAuthWithPermission('websites:read');
    const site = await service.getWebSite(session.companyId, id);
    if (!site) return { success: false, error: 'Sitio no encontrado' };
    return { success: true, data: site };
  } catch (error) {
    return fail(error);
  }
}

export async function createWebSiteAction(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const parsed = createWebSiteSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    // Precargar el contacto desde la ficha de un cliente es leer esa ficha: exige poder ver clientes.
    const created = await service.createWebSite(session.companyId, { name: session.name }, parsed.data, { canReadContacts: can(session, 'contacts:read') });
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'WebSite', entityId: created.id, metadata: { name: parsed.data.name, kind: parsed.data.kind, mode: parsed.data.mode } });
    revalidateSite();
    return { success: true, data: created, message: 'Sitio creado. Completa las secciones y revisa la lista "Qué le falta".' };
  } catch (error) {
    return fail(error, companyId, { action: 'createWebSite' });
  }
}

export async function saveWebSiteContentAction(id: string, input: unknown): Promise<ActionResult<{ version: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const parsed = saveWebSiteContentSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const saved = await service.saveWebSiteContent(session.companyId, id, parsed.data);
    revalidateSite(id);
    return { success: true, data: saved, message: 'Borrador guardado' };
  } catch (error) {
    return fail(error, companyId, { action: 'saveWebSiteContent', id });
  }
}

export async function updateWebSiteSettingsAction(id: string, input: unknown): Promise<ActionResult<{ slug: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const parsed = webSiteSettingsSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const before = await service.getWebSite(session.companyId, id);
    // Nombre, dirección, buscadores, logo e indexación de un sitio PUBLICADO se ven en vivo:
    // cambiarlos es publicar, así que lo decide quien tiene ese permiso.
    if (before?.status === 'PUBLISHED' && !can(session, 'websites:publish')) {
      return { success: false, error: 'Este sitio está publicado: solo dueño y administradores pueden cambiar su nombre, dirección, datos para buscadores o logo.' };
    }
    const updated = await service.updateWebSiteSettings(session.companyId, id, parsed.data);
    // Publicado: el enlace viejo deja de existir; se limpia la caché de ambos.
    if (before && before.slug !== updated.slug) revalidatePublic(before.slug);
    revalidatePublic(updated.slug);
    revalidateSite(id);
    return { success: true, data: updated, message: 'Ajustes guardados' };
  } catch (error) {
    return fail(error, companyId, { action: 'updateWebSiteSettings', id });
  }
}

export async function publishWebSiteAction(id: string): Promise<ActionResult<{ publishedAt: string; report: ReadinessReport }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:publish');
    companyId = session.companyId;
    const site = await service.getWebSite(session.companyId, id);
    // Un formulario que crea registros en otro módulo (CRM, academia, tareas) lo publica
    // quien puede crearlos ahí: publicar no puede ser un atajo para saltarse esos permisos.
    if (site?.mode === 'GUIDED') {
      for (const form of siteForms(site.document).filter((entry) => !entry.hidden)) {
        const info = DESTINATION_INFO[form.destination];
        if (!info.feature || !session.features[info.feature] || !info.publishPermission) continue;
        if (!can(session, info.publishPermission)) {
          return { success: false, error: `El formulario «${form.title}» envía sus datos a «${info.label}» y tu usuario no puede crear registros ahí. Cambia su destino o pídele a alguien con ese permiso que publique.` };
        }
      }
    }
    const published = await service.publishWebSite(session.companyId, id, session.features);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'WebSite', entityId: id, metadata: { event: 'publish', score: published.report.score } });
    if (site) revalidatePublic(site.slug);
    revalidateSite(id);
    return { success: true, data: { publishedAt: published.publishedAt.toISOString(), report: published.report }, message: 'Sitio publicado' };
  } catch (error) {
    return fail(error, companyId, { action: 'publishWebSite', id });
  }
}

export async function unpublishWebSiteAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:publish');
    companyId = session.companyId;
    const site = await service.getWebSite(session.companyId, id);
    await service.unpublishWebSite(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'WebSite', entityId: id, metadata: { event: 'unpublish' } });
    if (site) revalidatePublic(site.slug);
    revalidateSite(id);
    return { success: true, data: null, message: 'Sitio despublicado: ya no se ve en internet' };
  } catch (error) {
    return fail(error, companyId, { action: 'unpublishWebSite', id });
  }
}

export async function archiveWebSiteAction(id: string, archived: boolean): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:publish');
    companyId = session.companyId;
    const site = await service.getWebSite(session.companyId, id);
    await service.archiveWebSite(session.companyId, id, archived);
    if (site) revalidatePublic(site.slug);
    revalidateSite(id);
    return { success: true, data: null, message: archived ? 'Sitio archivado' : 'Sitio restaurado como borrador' };
  } catch (error) {
    return fail(error, companyId, { action: 'archiveWebSite', id });
  }
}

export async function duplicateWebSiteAction(id: string): Promise<ActionResult<{ id: string }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const copy = await service.duplicateWebSite(session.companyId, { name: session.name }, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'CREATE', entity: 'WebSite', entityId: copy.id, metadata: { event: 'duplicate', from: id } });
    revalidateSite();
    return { success: true, data: copy, message: 'Copia creada como borrador' };
  } catch (error) {
    return fail(error, companyId, { action: 'duplicateWebSite', id });
  }
}

export async function deleteWebSiteAction(id: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:publish');
    companyId = session.companyId;
    const site = await service.getWebSite(session.companyId, id);
    const removed = await service.deleteWebSite(session.companyId, id);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'DELETE', entity: 'WebSite', entityId: id, metadata: { name: site?.name, slug: site?.slug } });
    await domains.releaseDomain(session.companyId, removed.domain);
    // Archivos: solo los que ninguna otra fila usa (una copia comparte las mismas URL).
    await deleteUnusedBlobs(removed.urls, session.companyId);
    if (site) revalidatePublic(site.slug);
    revalidateSite();
    return { success: true, data: null, message: 'Sitio eliminado' };
  } catch (error) {
    return fail(error, companyId, { action: 'deleteWebSite', id });
  }
}

async function deleteUnusedBlobs(urls: string[], companyId: string): Promise<void> {
  const toDelete = await service.unusedAssetUrls(companyId, urls);
  if (toDelete.length === 0) return;
  try {
    await del(toDelete);
  } catch (error) {
    // El sitio ya se eliminó: un archivo huérfano no debe convertirlo en error.
    captureException(error, { module: 'sitios-web', companyId, extra: { reason: 'web-site-asset-cleanup' } });
  }
}

export async function updateWebSiteAssetAltAction(assetId: string, input: unknown): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const parsed = webSiteAssetAltSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    await service.updateAssetAlt(session.companyId, assetId, parsed.data.alt);
    return { success: true, data: null };
  } catch (error) {
    return fail(error, companyId, { action: 'updateWebSiteAssetAlt' });
  }
}

export async function deleteWebSiteAssetAction(assetId: string): Promise<ActionResult<null>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const { urlToDelete } = await service.deleteAsset(session.companyId, assetId);
    if (urlToDelete) {
      try {
        await del(urlToDelete);
      } catch (error) {
        captureException(error, { module: 'sitios-web', companyId, extra: { reason: 'web-site-asset-delete' } });
      }
    }
    return { success: true, data: null, message: 'Imagen eliminada' };
  } catch (error) {
    return fail(error, companyId, { action: 'deleteWebSiteAsset' });
  }
}

/** Bandeja de formularios: de un sitio (`siteId`) o de toda la empresa, con filtros. */
export async function listFormMessagesAction(filter: unknown): Promise<ActionResult<FormMessagesPage>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:read');
    companyId = session.companyId;
    const parsed = messageFilterSchema.safeParse(filter ?? {});
    if (!parsed.success) return { success: false, error: 'Filtro inválido' };
    return { success: true, data: await forms.listFormMessages(session.companyId, parsed.data) };
  } catch (error) {
    return fail(error, companyId, { action: 'listFormMessages' });
  }
}

export async function setWebSiteMessageArchivedAction(messageId: string, archived: boolean): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('websites:write');
    await forms.setMessageArchived(session.companyId, messageId, archived);
    revalidatePath('/dashboard/web-sites');
    return { success: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function markWebSiteMessagesReadAction(filter: unknown): Promise<ActionResult<{ count: number }>> {
  try {
    const session = await requireAuthWithPermission('websites:write');
    const parsed = messageFilterSchema.safeParse(filter ?? {});
    if (!parsed.success) return { success: false, error: 'Filtro inválido' };
    const count = await forms.markAllRead(session.companyId, parsed.data);
    revalidatePath('/dashboard/web-sites');
    return { success: true, data: { count }, message: count === 1 ? '1 mensaje marcado como leído' : `${count} mensajes marcados como leídos` };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Lleva un mensaje de la bandeja al CRM, la academia o las tareas. Exige
 * editar sitios Y poder crear registros en el destino.
 */
export async function routeWebSiteMessageAction(messageId: string, destination: string): Promise<ActionResult<{ kind: FormDestination; id: string | null; href: string | null; note: string | null }>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    const target = routeDestinationSchema.safeParse(destination);
    if (!target.success) return { success: false, error: 'Destino inválido' };
    const info = DESTINATION_INFO[target.data];
    if (info.feature && !session.features[info.feature]) return { success: false, error: `Tu plan no incluye el módulo de ${info.area}.` };
    if (info.routePermission && !can(session, info.routePermission)) return { success: false, error: `No tienes permiso para crear registros en «${info.label}».` };
    const routed = await forms.routeExistingMessage({ companyId: session.companyId, userId: session.id, features: session.features }, messageId, target.data);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'WebSiteMessage', entityId: messageId, metadata: { event: 'route', destination: target.data, recordId: routed.id } });
    revalidatePath('/dashboard/web-sites');
    return { success: true, data: { kind: routed.kind, id: routed.id, href: routed.href, note: routed.note }, message: routed.note ?? `Listo: quedó en ${info.where}.` };
  } catch (error) {
    return fail(error, companyId, { action: 'routeWebSiteMessage', messageId, destination });
  }
}

/**
 * Nombres de los grupos activos de la academia, para cargarlos como opciones
 * de la pregunta «Grupo que te interesa» (la inscripción llega con el grupo
 * elegido). Exige editar sitios y ver la academia.
 */
export async function listAcademyGroupNamesAction(): Promise<ActionResult<string[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    if (!can(session, 'academy:read')) return { success: false, error: 'No tienes permiso para ver los grupos de la academia.' };
    const groups = await prisma.academyGroup.findMany({ where: { companyId: session.companyId, isActive: true }, orderBy: { name: 'asc' }, select: { name: true }, take: 12 });
    return { success: true, data: groups.map((group) => group.name) };
  } catch (error) {
    return fail(error, companyId, { action: 'listAcademyGroupNames' });
  }
}

export async function setWebSiteMessageReadAction(messageId: string, read: boolean): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('websites:write');
    await service.setMessageRead(session.companyId, messageId, read);
    revalidatePath('/dashboard/web-sites');
    return { success: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteWebSiteMessageAction(messageId: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAuthWithPermission('websites:write');
    await service.deleteWebSiteMessage(session.companyId, messageId);
    revalidatePath('/dashboard/web-sites');
    return { success: true, data: null };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Estado del dominio propio. Consultarlo tiene efectos (registra el dominio en
 * el servidor y puede marcarlo verificado), por eso exige el permiso de publicar.
 */
export async function getWebSiteDomainAction(siteId: string): Promise<ActionResult<WebSiteDomainView>> {
  try {
    const session = await requireAuthWithPermission('websites:publish');
    return { success: true, data: await domains.refreshWebSiteDomain(session.companyId, siteId) };
  } catch (error) {
    return fail(error);
  }
}

export async function setWebSiteDomainAction(siteId: string, input: unknown): Promise<ActionResult<WebSiteDomainView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:publish');
    companyId = session.companyId;
    const parsed = webSiteDomainSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
    const view = await domains.setWebSiteDomain(session.companyId, siteId, parsed.data.domain);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'WebSite', entityId: siteId, metadata: { event: 'set-domain', domain: view.domain } });
    revalidateSite(siteId);
    return { success: true, data: view, message: 'Dominio guardado' };
  } catch (error) {
    return fail(error, companyId, { action: 'setWebSiteDomain', siteId });
  }
}

export async function removeWebSiteDomainAction(siteId: string): Promise<ActionResult<WebSiteDomainView>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:publish');
    companyId = session.companyId;
    const view = await domains.removeWebSiteDomain(session.companyId, siteId);
    await createAuditLog({ companyId: session.companyId, userId: session.id, userEmail: session.email, action: 'UPDATE', entity: 'WebSite', entityId: siteId, metadata: { event: 'remove-domain' } });
    revalidateSite(siteId);
    return { success: true, data: view, message: 'Dominio quitado' };
  } catch (error) {
    return fail(error, companyId, { action: 'removeWebSiteDomain', siteId });
  }
}

/**
 * Productos del inventario para importarlos al catálogo del sitio. Exige
 * editar sitios Y ver el catálogo de productos: quien no ve productos en el
 * ERP tampoco los puede sacar por esta vía.
 */
export async function listCatalogProductsAction(q?: string): Promise<ActionResult<service.CatalogProductRow[]>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('websites:write');
    companyId = session.companyId;
    if (!can(session, 'products:read')) return { success: false, error: 'No tienes permiso para ver los productos del inventario.' };
    const query = catalogProductsQuerySchema.safeParse(q);
    if (!query.success) return { success: false, error: 'Búsqueda inválida' };
    return { success: true, data: await service.listCatalogProducts(session.companyId, query.data) };
  } catch (error) {
    return fail(error, companyId, { action: 'listCatalogProducts' });
  }
}

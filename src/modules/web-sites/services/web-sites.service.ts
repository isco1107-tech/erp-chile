import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Prisma, WebSiteKind, WebSiteMode, WebSiteStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isUniqueConstraintError } from '@/lib/prisma-errors';
import { getAppUrl } from '@/lib/email/mailer';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
import { blockImageUrls, blocksSchema, parseBlocks, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { MAX_HTML_BYTES, sanitizeHtml } from '@/lib/web-sites/html';
import { evaluateReadiness, type ReadinessReport } from '@/lib/web-sites/readiness';
import { starterBlocks, starterHtml } from '@/lib/web-sites/templates';
import { parseTheme, type WebSiteTheme } from '@/lib/web-sites/theme';
import { slugify } from '@/lib/web-sites/urls';
import type { CreateWebSiteInput, PublicWebSiteMessageInput, SaveWebSiteContentInput, WebSiteSettingsInput } from '../schema';

/**
 * Servicio de sitios web. Todo filtra por `companyId` (multi-tenant): las
 * lecturas usan `findFirst` con `{ id, companyId }` y las escrituras
 * `updateMany`/`deleteMany`, para que omitir el filtro sea imposible por accidente.
 *
 * Borrador y publicado son copias distintas: editar nunca cambia lo que ve el
 * público hasta que alguien publica (y publicar exige pasar la lista "qué falta").
 */

export class WebSiteError extends Error {}

export const MAX_SITES_PER_COMPANY = 30;
export const MAX_ASSETS_PER_SITE = 60;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export interface WebSiteRow {
  id: string;
  name: string;
  slug: string;
  kind: WebSiteKind;
  mode: WebSiteMode;
  status: WebSiteStatus;
  contactName: string | null;
  customDomain: string | null;
  customDomainVerified: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  /** Hay cambios en el borrador que todavía no se publicaron. */
  pendingChanges: boolean;
  unreadMessages: number;
}

export interface WebSiteAssetRow {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  alt: string;
  createdAt: Date;
}

export interface WebSiteDetail {
  id: string;
  name: string;
  slug: string;
  kind: WebSiteKind;
  mode: WebSiteMode;
  status: WebSiteStatus;
  contactId: string | null;
  contactName: string | null;
  seoTitle: string;
  seoDescription: string;
  indexable: boolean;
  logoUrl: string;
  ogImageUrl: string;
  theme: WebSiteTheme;
  blocks: WebSiteBlock[];
  html: string;
  publishedAt: Date | null;
  pendingChanges: boolean;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
  publicUrl: string;
  /** Logo de la empresa, por si el sitio no tiene uno propio. */
  companyLogoUrl: string | null;
  companyName: string;
  assets: WebSiteAssetRow[];
  unreadMessages: number;
  /** ISO de `updatedAt`, para detectar ediciones simultáneas. */
  version: string;
  createdAt: Date;
}

export interface WebSiteMessageRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  readAt: Date | null;
  createdAt: Date;
}

export function publicSiteUrl(slug: string): string {
  return `${getAppUrl().replace(/\/$/, '')}/web/${slug}`;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** ¿El borrador difiere de lo publicado? Solo tiene sentido en un sitio publicado. */
function hasPendingChanges(site: {
  status: WebSiteStatus;
  mode: WebSiteMode;
  draftBlocks: unknown;
  publishedBlocks: unknown;
  theme: unknown;
  publishedTheme: unknown;
  draftHtml: string | null;
  publishedHtml: string | null;
}): boolean {
  if (site.status !== 'PUBLISHED') return false;
  if (site.mode === 'HTML') return sanitizeHtml(site.draftHtml ?? '').html !== (site.publishedHtml ?? '');
  return !sameJson(site.draftBlocks, site.publishedBlocks) || !sameJson(parseTheme(site.theme), parseTheme(site.publishedTheme));
}

/** Toda URL de imagen debe ser de nuestro almacenamiento: nada de rastreadores ni hotlinks. */
function assertOwnImages(urls: string[]): void {
  for (const url of urls) {
    if (url && !isAllowedBlobUrl(url)) throw new WebSiteError('Una imagen no viene de la biblioteca del sitio. Súbela desde "Imágenes" y elígela ahí.');
  }
}

async function assertContact(companyId: string, contactId: string | null | undefined): Promise<string | null> {
  if (!contactId) return null;
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
  if (!contact) throw new WebSiteError('El cliente seleccionado no existe');
  return contact.id;
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = base || 'sitio';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root.slice(0, 44)}-${randomUUID().slice(0, 5)}`;
    const taken = await prisma.webSite.findFirst({ where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new WebSiteError('No se pudo generar una dirección libre; escribe otra.');
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listWebSites(companyId: string, filter: { status?: WebSiteStatus | 'ALL'; q?: string } = {}): Promise<{ rows: WebSiteRow[]; counts: Record<string, number> }> {
  const q = filter.q?.trim();
  const [sites, unread, grouped] = await Promise.all([
    prisma.webSite.findMany({
      where: {
        companyId,
        ...(filter.status && filter.status !== 'ALL' ? { status: filter.status } : { status: { not: 'ARCHIVED' } }),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }, { contact: { razonSocial: { contains: q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true, name: true, slug: true, kind: true, mode: true, status: true, publishedAt: true, updatedAt: true, customDomain: true, customDomainVerifiedAt: true,
        draftBlocks: true, publishedBlocks: true, theme: true, publishedTheme: true, draftHtml: true, publishedHtml: true,
        contact: { select: { razonSocial: true, nombreFantasia: true } },
      },
    }),
    prisma.webSiteMessage.groupBy({ by: ['siteId'], where: { companyId, readAt: null }, _count: { _all: true } }),
    prisma.webSite.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
  ]);
  const unreadBySite = new Map(unread.map((row) => [row.siteId, row._count._all]));
  const counts: Record<string, number> = { DRAFT: 0, PUBLISHED: 0, ARCHIVED: 0 };
  for (const row of grouped) counts[row.status] = row._count._all;
  return {
    counts,
    rows: sites.map((site) => ({
      id: site.id,
      name: site.name,
      slug: site.slug,
      kind: site.kind,
      mode: site.mode,
      status: site.status,
      contactName: site.contact ? site.contact.nombreFantasia || site.contact.razonSocial : null,
      customDomain: site.customDomain,
      customDomainVerified: Boolean(site.customDomainVerifiedAt),
      publishedAt: site.publishedAt,
      updatedAt: site.updatedAt,
      pendingChanges: hasPendingChanges(site),
      unreadMessages: unreadBySite.get(site.id) ?? 0,
    })),
  };
}

export async function getWebSite(companyId: string, id: string): Promise<WebSiteDetail | null> {
  const site = await prisma.webSite.findFirst({
    where: { id, companyId },
    include: {
      contact: { select: { razonSocial: true, nombreFantasia: true } },
      company: { select: { businessName: true, logoUrl: true } },
      assets: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!site) return null;
  const unreadMessages = await prisma.webSiteMessage.count({ where: { companyId, siteId: id, readAt: null } });
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    kind: site.kind,
    mode: site.mode,
    status: site.status,
    contactId: site.contactId,
    contactName: site.contact ? site.contact.nombreFantasia || site.contact.razonSocial : null,
    seoTitle: site.seoTitle ?? '',
    seoDescription: site.seoDescription ?? '',
    indexable: site.indexable,
    logoUrl: site.logoUrl ?? '',
    ogImageUrl: site.ogImageUrl ?? '',
    theme: parseTheme(site.theme),
    blocks: parseBlocks(site.draftBlocks),
    html: site.draftHtml ?? '',
    publishedAt: site.publishedAt,
    pendingChanges: hasPendingChanges(site),
    customDomain: site.customDomain,
    customDomainVerifiedAt: site.customDomainVerifiedAt,
    publicUrl: publicSiteUrl(site.slug),
    companyLogoUrl: site.company.logoUrl,
    companyName: site.company.businessName,
    assets: site.assets.map((asset) => ({ id: asset.id, url: asset.url, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, alt: asset.alt ?? '', createdAt: asset.createdAt })),
    unreadMessages,
    version: site.updatedAt.toISOString(),
    createdAt: site.createdAt,
  };
}

/** Evaluación en el servidor (la misma que ve el editor), para no confiar en el navegador. */
export function readinessOf(site: Pick<WebSiteDetail, 'kind' | 'mode' | 'seoTitle' | 'seoDescription' | 'logoUrl' | 'theme' | 'blocks' | 'html'>): ReadinessReport {
  return evaluateReadiness({ kind: site.kind, mode: site.mode, seoTitle: site.seoTitle, seoDescription: site.seoDescription, logoUrl: site.logoUrl, theme: site.theme, blocks: site.blocks, html: site.html });
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export async function createWebSite(companyId: string, actor: { name: string }, input: CreateWebSiteInput): Promise<{ id: string; slug: string }> {
  const total = await prisma.webSite.count({ where: { companyId, status: { not: 'ARCHIVED' } } });
  if (total >= MAX_SITES_PER_COMPANY) throw new WebSiteError(`Llegaste al máximo de ${MAX_SITES_PER_COMPANY} sitios activos. Archiva o elimina alguno.`);
  const contactId = await assertContact(companyId, input.contactId);

  let slug: string;
  if (input.slug) {
    const taken = await prisma.webSite.findFirst({ where: { slug: input.slug }, select: { id: true } });
    if (taken) throw new WebSiteError('Esa dirección ya la usa otro sitio. Prueba con otra.');
    slug = input.slug;
  } else {
    slug = await uniqueSlug(slugify(input.name));
  }

  try {
    const site = await prisma.webSite.create({
      data: {
        companyId,
        name: input.name,
        slug,
        kind: input.kind,
        mode: input.mode,
        contactId,
        seoTitle: input.name.slice(0, 65),
        createdByName: actor.name,
        theme: json(parseTheme({})),
        draftBlocks: input.mode === 'GUIDED' ? json(starterBlocks(input.kind, { name: input.name })) : json([]),
        draftHtml: input.mode === 'HTML' ? starterHtml(input.name) : null,
      },
      select: { id: true, slug: true },
    });
    return site;
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new WebSiteError('Esa dirección ya la usa otro sitio. Prueba con otra.');
    throw error;
  }
}

export async function saveWebSiteContent(companyId: string, id: string, input: SaveWebSiteContentInput): Promise<{ version: string }> {
  const site = await prisma.webSite.findFirst({ where: { id, companyId }, select: { mode: true, status: true } });
  if (!site) throw new WebSiteError('Sitio no encontrado');
  if (site.status === 'ARCHIVED') throw new WebSiteError('El sitio está archivado. Restáuralo para editarlo.');

  const data: Prisma.WebSiteUpdateManyMutationInput = {};
  if (input.blocks) {
    if (site.mode !== 'GUIDED') throw new WebSiteError('Este sitio usa HTML propio: no tiene secciones.');
    assertOwnImages(input.blocks.flatMap(blockImageUrls));
    data.draftBlocks = json(input.blocks);
  }
  if (input.theme) data.theme = json(input.theme);
  if (input.html !== undefined) {
    if (site.mode !== 'HTML') throw new WebSiteError('Este sitio se arma con secciones: no admite HTML propio.');
    const html = input.html ?? '';
    if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) throw new WebSiteError(`El HTML supera los ${MAX_HTML_BYTES / 1000} KB permitidos.`);
    data.draftHtml = html;
  }

  const expected = input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : null;
  const result = await prisma.webSite.updateMany({ where: { id, companyId, ...(expected ? { updatedAt: expected } : {}) }, data });
  if (result.count === 0) throw new WebSiteError('Otra persona guardó cambios en este sitio mientras lo editabas. Recarga la página para ver la última versión.');
  const fresh = await prisma.webSite.findFirst({ where: { id, companyId }, select: { updatedAt: true } });
  return { version: (fresh?.updatedAt ?? new Date()).toISOString() };
}

export async function updateWebSiteSettings(companyId: string, id: string, input: WebSiteSettingsInput): Promise<{ slug: string }> {
  const site = await prisma.webSite.findFirst({ where: { id, companyId }, select: { id: true, slug: true } });
  if (!site) throw new WebSiteError('Sitio no encontrado');
  const contactId = await assertContact(companyId, input.contactId);
  assertOwnImages([input.logoUrl ?? '', input.ogImageUrl ?? '']);
  if (input.slug !== site.slug) {
    const taken = await prisma.webSite.findFirst({ where: { slug: input.slug, NOT: { id } }, select: { id: true } });
    if (taken) throw new WebSiteError('Esa dirección ya la usa otro sitio. Prueba con otra.');
  }
  try {
    await prisma.webSite.updateMany({
      where: { id, companyId },
      data: {
        name: input.name,
        slug: input.slug,
        seoTitle: input.seoTitle || null,
        seoDescription: input.seoDescription || null,
        indexable: input.indexable,
        logoUrl: input.logoUrl || null,
        ogImageUrl: input.ogImageUrl || null,
        contactId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new WebSiteError('Esa dirección ya la usa otro sitio. Prueba con otra.');
    throw error;
  }
  return { slug: input.slug };
}

/**
 * Publica una copia del borrador. Exige pasar la lista "qué falta" (los ítems
 * obligatorios): la revisa el servidor, no el navegador.
 */
export async function publishWebSite(companyId: string, id: string): Promise<{ publishedAt: Date; report: ReadinessReport }> {
  const site = await getWebSite(companyId, id);
  if (!site) throw new WebSiteError('Sitio no encontrado');
  if (site.status === 'ARCHIVED') throw new WebSiteError('El sitio está archivado. Restáuralo antes de publicarlo.');
  const report = readinessOf(site);
  if (!report.canPublish) {
    const pending = report.items.filter((item) => item.required && !item.ok).map((item) => item.label);
    throw new WebSiteError(`Aún no se puede publicar. Falta: ${pending.join(', ')}.`);
  }
  const publishedAt = new Date();
  await prisma.webSite.updateMany({
    where: { id, companyId },
    data: {
      status: 'PUBLISHED',
      publishedAt,
      publishedBlocks: site.mode === 'GUIDED' ? json(site.blocks) : json([]),
      publishedTheme: json(site.theme),
      publishedHtml: site.mode === 'HTML' ? sanitizeHtml(site.html).html : null,
    },
  });
  return { publishedAt, report };
}

export async function unpublishWebSite(companyId: string, id: string): Promise<void> {
  const result = await prisma.webSite.updateMany({ where: { id, companyId, status: 'PUBLISHED' }, data: { status: 'DRAFT' } });
  if (result.count === 0) throw new WebSiteError('El sitio no está publicado');
}

export async function archiveWebSite(companyId: string, id: string, archived: boolean): Promise<void> {
  const result = await prisma.webSite.updateMany({
    where: { id, companyId, status: archived ? { not: 'ARCHIVED' } : 'ARCHIVED' },
    data: { status: archived ? 'ARCHIVED' : 'DRAFT' },
  });
  if (result.count === 0) throw new WebSiteError(archived ? 'El sitio ya está archivado' : 'El sitio no está archivado');
}

export async function duplicateWebSite(companyId: string, actor: { name: string }, id: string): Promise<{ id: string }> {
  const total = await prisma.webSite.count({ where: { companyId, status: { not: 'ARCHIVED' } } });
  if (total >= MAX_SITES_PER_COMPANY) throw new WebSiteError(`Llegaste al máximo de ${MAX_SITES_PER_COMPANY} sitios activos.`);
  const source = await prisma.webSite.findFirst({ where: { id, companyId }, include: { assets: true } });
  if (!source) throw new WebSiteError('Sitio no encontrado');
  const slug = await uniqueSlug(`${source.slug.slice(0, 40)}-copia`);
  const copy = await prisma.webSite.create({
    data: {
      companyId,
      name: `${source.name} (copia)`.slice(0, 80),
      slug,
      kind: source.kind,
      mode: source.mode,
      contactId: source.contactId,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      indexable: source.indexable,
      logoUrl: source.logoUrl,
      ogImageUrl: source.ogImageUrl,
      theme: json(parseTheme(source.theme)),
      draftBlocks: json(parseBlocks(source.draftBlocks)),
      draftHtml: source.draftHtml,
      createdByName: actor.name,
      // Las imágenes se comparten por URL: se copian sus filas para que borrar
      // el archivo de un sitio no deje sin imagen al otro (ver `deleteAsset`).
      assets: { create: source.assets.map((asset) => ({ companyId, url: asset.url, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, alt: asset.alt })) },
    },
    select: { id: true },
  });
  return copy;
}

/** Elimina el sitio, su biblioteca y sus mensajes. Un sitio publicado se despublica antes. */
export async function deleteWebSite(companyId: string, id: string): Promise<{ urls: string[]; domain: string | null }> {
  const site = await prisma.webSite.findFirst({ where: { id, companyId }, select: { status: true, customDomain: true, assets: { select: { url: true } } } });
  if (!site) throw new WebSiteError('Sitio no encontrado');
  if (site.status === 'PUBLISHED') throw new WebSiteError('Despublica el sitio antes de eliminarlo.');
  await prisma.webSite.deleteMany({ where: { id, companyId } });
  return { urls: site.assets.map((asset) => asset.url), domain: site.customDomain };
}

// ---------------------------------------------------------------------------
// Biblioteca de imágenes
// ---------------------------------------------------------------------------

export async function registerAsset(companyId: string, siteId: string, input: { url: string; fileName: string; mimeType: string; sizeBytes: number; alt?: string }): Promise<WebSiteAssetRow> {
  const site = await prisma.webSite.findFirst({ where: { id: siteId, companyId }, select: { id: true } });
  if (!site) throw new WebSiteError('Sitio no encontrado');
  const count = await prisma.webSiteAsset.count({ where: { companyId, siteId } });
  if (count >= MAX_ASSETS_PER_SITE) throw new WebSiteError(`La biblioteca del sitio admite hasta ${MAX_ASSETS_PER_SITE} imágenes. Elimina las que no uses.`);
  const asset = await prisma.webSiteAsset.create({
    data: { companyId, siteId, url: input.url, fileName: input.fileName.slice(0, 120), mimeType: input.mimeType, sizeBytes: input.sizeBytes, alt: input.alt?.slice(0, 160) || null },
  });
  return { id: asset.id, url: asset.url, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, alt: asset.alt ?? '', createdAt: asset.createdAt };
}

/** Comprueba, ANTES de subir el archivo, que el sitio es de la empresa y que la biblioteca tiene espacio. */
export async function assertCanAddAsset(companyId: string, siteId: string): Promise<void> {
  const site = await prisma.webSite.findFirst({ where: { id: siteId, companyId }, select: { id: true, status: true } });
  if (!site) throw new WebSiteError('Sitio no encontrado');
  if (site.status === 'ARCHIVED') throw new WebSiteError('El sitio está archivado. Restáuralo para subir imágenes.');
  const count = await prisma.webSiteAsset.count({ where: { companyId, siteId } });
  if (count >= MAX_ASSETS_PER_SITE) throw new WebSiteError(`La biblioteca del sitio admite hasta ${MAX_ASSETS_PER_SITE} imágenes. Elimina las que no uses.`);
}

export async function updateAssetAlt(companyId: string, assetId: string, alt: string): Promise<void> {
  const result = await prisma.webSiteAsset.updateMany({ where: { id: assetId, companyId }, data: { alt: alt || null } });
  if (result.count === 0) throw new WebSiteError('Imagen no encontrada');
}

/** Devuelve la URL a borrar del almacenamiento (`null` si otro sitio todavía la usa). */
export async function deleteAsset(companyId: string, assetId: string): Promise<{ urlToDelete: string | null }> {
  const asset = await prisma.webSiteAsset.findFirst({ where: { id: assetId, companyId }, include: { site: { select: { draftBlocks: true, publishedBlocks: true, logoUrl: true, ogImageUrl: true, draftHtml: true, publishedHtml: true } } } });
  if (!asset) throw new WebSiteError('Imagen no encontrada');
  const usedHere = [asset.site.draftBlocks, asset.site.publishedBlocks].some((value) => JSON.stringify(value ?? null).includes(asset.url)) ||
    [asset.site.logoUrl, asset.site.ogImageUrl, asset.site.draftHtml, asset.site.publishedHtml].some((value) => (value ?? '').includes(asset.url));
  if (usedHere) throw new WebSiteError('Esta imagen se usa en el sitio. Quítala de las secciones (y despublica o vuelve a publicar) antes de eliminarla.');
  await prisma.webSiteAsset.deleteMany({ where: { id: assetId, companyId } });
  const others = await prisma.webSiteAsset.count({ where: { url: asset.url } });
  return { urlToDelete: others === 0 ? asset.url : null };
}

/** De estas URL, las que ninguna fila de biblioteca usa (las que sí se pueden borrar del almacenamiento). */
export async function unusedAssetUrls(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];
  const used = new Set((await prisma.webSiteAsset.findMany({ where: { url: { in: urls } }, select: { url: true } })).map((row) => row.url));
  return urls.filter((url) => !used.has(url));
}

// ---------------------------------------------------------------------------
// Mensajes del formulario de contacto
// ---------------------------------------------------------------------------

export async function listWebSiteMessages(companyId: string, siteId: string): Promise<WebSiteMessageRow[]> {
  return prisma.webSiteMessage.findMany({
    where: { companyId, siteId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, name: true, email: true, phone: true, message: true, readAt: true, createdAt: true },
  });
}

export async function setMessageRead(companyId: string, messageId: string, read: boolean): Promise<void> {
  const result = await prisma.webSiteMessage.updateMany({ where: { id: messageId, companyId }, data: { readAt: read ? new Date() : null } });
  if (result.count === 0) throw new WebSiteError('Mensaje no encontrado');
}

export async function deleteWebSiteMessage(companyId: string, messageId: string): Promise<void> {
  const result = await prisma.webSiteMessage.deleteMany({ where: { id: messageId, companyId } });
  if (result.count === 0) throw new WebSiteError('Mensaje no encontrado');
}

// ---------------------------------------------------------------------------
// Público (sin sesión)
// ---------------------------------------------------------------------------

export interface PublicWebSite {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  mode: WebSiteMode;
  title: string;
  description: string | null;
  indexable: boolean;
  logoUrl: string | null;
  ogImageUrl: string | null;
  theme: WebSiteTheme;
  blocks: WebSiteBlock[];
  html: string;
  /** El sitio publicado tiene un formulario de contacto activo. */
  acceptsMessages: boolean;
  customDomain: string | null;
  customDomainVerified: boolean;
  publishedAt: Date | null;
}

const PUBLIC_SELECT = {
  id: true, companyId: true, name: true, slug: true, mode: true, status: true, seoTitle: true, seoDescription: true, indexable: true, logoUrl: true, ogImageUrl: true,
  publishedBlocks: true, publishedTheme: true, publishedHtml: true, publishedAt: true, customDomain: true, customDomainVerifiedAt: true,
  company: { select: { businessName: true, status: true, features: { select: { hasWebSites: true } } } },
} satisfies Prisma.WebSiteSelect;

type PublicRow = Prisma.WebSiteGetPayload<{ select: typeof PUBLIC_SELECT }>;

function toPublic(site: PublicRow | null): PublicWebSite | null {
  if (!site || site.status !== 'PUBLISHED') return null;
  // Empresa suspendida/cancelada o sin el módulo: el sitio deja de verse en el acto.
  if (site.company.status === 'SUSPENDED' || site.company.status === 'CANCELLED' || !site.company.features?.hasWebSites) return null;
  const blocks = parseBlocks(site.publishedBlocks);
  return {
    id: site.id,
    companyId: site.companyId,
    name: site.name,
    slug: site.slug,
    mode: site.mode,
    title: site.seoTitle?.trim() || site.name,
    description: site.seoDescription?.trim() || null,
    indexable: site.indexable,
    logoUrl: site.logoUrl,
    ogImageUrl: site.ogImageUrl,
    theme: parseTheme(site.publishedTheme),
    blocks,
    html: site.publishedHtml ?? '',
    acceptsMessages: blocks.some((block) => block.type === 'contact' && !block.hidden && block.showForm),
    customDomain: site.customDomain,
    customDomainVerified: Boolean(site.customDomainVerifiedAt),
    publishedAt: site.publishedAt,
  };
}

export async function getPublicWebSite(slug: string): Promise<PublicWebSite | null> {
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) return null;
  return toPublic(await prisma.webSite.findUnique({ where: { slug }, select: PUBLIC_SELECT }));
}

/**
 * Sitio de un dominio propio. Un dominio sin verificar solo publica si la
 * petición llegó por ese mismo dominio: esa visita es la prueba de que el DNS
 * ya apunta acá, y deja el dominio verificado sin esperar a nadie.
 */
export async function getPublicWebSiteByDomain(domain: string, reachedViaDomain = false): Promise<PublicWebSite | null> {
  const row = await prisma.webSite.findUnique({ where: { customDomain: domain }, select: PUBLIC_SELECT });
  if (!row) return null;
  if (!row.customDomainVerifiedAt) {
    if (!reachedViaDomain) return null;
    await prisma.webSite.updateMany({ where: { id: row.id, companyId: row.companyId, customDomain: domain, customDomainVerifiedAt: null }, data: { customDomainVerifiedAt: new Date() } });
  }
  return toPublic(row);
}

export async function createPublicMessage(site: Pick<PublicWebSite, 'id' | 'companyId'>, input: PublicWebSiteMessageInput): Promise<{ id: string }> {
  const message = await prisma.webSiteMessage.create({
    data: { companyId: site.companyId, siteId: site.id, name: input.name, email: input.email, phone: input.phone || null, message: input.message },
    select: { id: true },
  });
  return message;
}

export async function countUnreadMessages(companyId: string): Promise<number> {
  return prisma.webSiteMessage.count({ where: { companyId, readAt: null } });
}

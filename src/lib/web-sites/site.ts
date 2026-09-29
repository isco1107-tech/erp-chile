import { z } from 'zod';
import { blockAnchors, blockSchema, blocksSchema, buildNav, cloneBlock, isBlockEmpty, MAX_BLOCKS, newBlockId, parseBlocks, type WebSiteBlock } from './blocks';
import { isValidPageSlug, pageSlugProblem, PAGE_SLUG_MAX } from './page-slugs';
import { parseTheme } from './theme';
import { isExternalHref, safeHref, slugify, SOCIAL_NETWORKS, type SocialNetwork } from './urls';

/**
 * Documento de un sitio armado en modo guiado: sus páginas (cada una con sus
 * secciones), el encabezado con su menú, el pie, las redes sociales y el botón
 * flotante de WhatsApp. Se guarda como JSON en `WebSite.draftBlocks` (y la
 * copia congelada en `publishedBlocks`): los sitios del primer formato, que
 * guardaban ahí una lista de secciones, se leen como un sitio de una página
 * (`parseSiteDocument`), sin migración de datos.
 *
 * Enlaces internos: un botón o un ítem del menú que lleva a otra página del
 * sitio guarda `page:<id de la página>` (y opcionalmente `#ancla`), no la
 * dirección: renombrar la página o cambiar su dirección no rompe los enlaces.
 * `resolveLink` los traduce a la dirección real según dónde se publique
 * (`/web/mi-sitio/servicios` o `minegocio.cl/servicios`).
 */

export const SITE_DOCUMENT_VERSION = 2;
export const MAX_PAGES = 20;
export const MAX_TOTAL_BLOCKS = 200;
export const MAX_MENU_ITEMS = 10;
export const MAX_SUBMENU_ITEMS = 10;
export const MAX_FOOTER_COLUMNS = 4;
export const MAX_FOOTER_LINKS = 8;
/** Tope del JSON del sitio: holgado para 20 páginas y lejos del límite de 1 MB de las Server Actions. */
export const MAX_DOCUMENT_BYTES = 700 * 1024;

const text = (max: number) => z.string().trim().max(max).default('');
const link = z.string().trim().max(500).default('');
const id = z.string().trim().min(1).max(40);
const choice = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).default(fallback).catch(fallback);

// ---------------------------------------------------------------------------
// Esquemas
// ---------------------------------------------------------------------------

export const menuLinkSchema = z.object({
  id,
  label: text(40),
  href: link,
  /** Abrir en una pestaña nueva del navegador. */
  newTab: z.boolean().default(false),
});
export type MenuLink = z.infer<typeof menuLinkSchema>;

export const menuItemSchema = menuLinkSchema.extend({
  /** Submenú desplegable (un nivel). Con submenú, el ítem igual puede tener su propio enlace. */
  children: z.array(menuLinkSchema).max(MAX_SUBMENU_ITEMS).default([]),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const HEADER_LAYOUTS = ['classic', 'centered', 'minimal'] as const;
export type HeaderLayout = (typeof HEADER_LAYOUTS)[number];
export const HEADER_STYLES = ['light', 'primary', 'transparent'] as const;
export type HeaderStyle = (typeof HEADER_STYLES)[number];
export const ANNOUNCEMENT_STYLES = ['accent', 'primary', 'dark'] as const;

export const announcementSchema = z.object({
  enabled: z.boolean().default(false),
  text: text(140),
  href: link,
  linkLabel: text(30),
  style: choice(ANNOUNCEMENT_STYLES, 'accent'),
});

export const headerSchema = z.object({
  enabled: z.boolean().default(true),
  /** classic: logo a la izquierda y menú a la derecha · centered: logo al centro y menú debajo · minimal: logo y botón de menú. */
  layout: choice(HEADER_LAYOUTS, 'classic'),
  /** light: fondo de la página · primary: color principal · transparent: sobre la portada. */
  style: choice(HEADER_STYLES, 'light'),
  /** Queda fija arriba al bajar por la página. */
  sticky: z.boolean().default(true),
  showLogo: z.boolean().default(true),
  showName: z.boolean().default(true),
  /** Texto corto bajo el nombre (lema, rubro, ciudad). */
  tagline: text(80),
  /** Botón destacado a la derecha del menú. */
  ctaLabel: text(30),
  ctaHref: link,
  ctaNewTab: z.boolean().default(false),
  /** auto: el menú se arma solo con las páginas (o las secciones, si hay una sola página) · custom: el que armes tú. */
  menuMode: choice(['auto', 'custom'] as const, 'auto'),
  menu: z.array(menuItemSchema).max(MAX_MENU_ITEMS).default([]),
  showSocial: z.boolean().default(false),
  announcement: announcementSchema.prefault({}),
});
export type SiteHeader = z.infer<typeof headerSchema>;

export const footerColumnSchema = z.object({
  id,
  title: text(40),
  links: z.array(menuLinkSchema).max(MAX_FOOTER_LINKS).default([]),
});
export type FooterColumn = z.infer<typeof footerColumnSchema>;

export const FOOTER_LAYOUTS = ['simple', 'columns'] as const;
export const FOOTER_STYLES = ['light', 'muted', 'dark', 'primary'] as const;
export const footerSchema = z.object({
  enabled: z.boolean().default(true),
  /** simple: una línea centrada · columns: descripción, columnas de enlaces y redes. */
  layout: choice(FOOTER_LAYOUTS, 'simple'),
  style: choice(FOOTER_STYLES, 'light'),
  /** Descripción breve del negocio (primera columna). */
  about: text(300),
  columns: z.array(footerColumnSchema).max(MAX_FOOTER_COLUMNS).default([]),
  /** Leyenda final (derechos, razón social). Vacío = "© año Nombre". */
  text: text(200),
  showSocial: z.boolean().default(true),
  /** Repetir los enlaces del menú principal en el pie. */
  showMenu: z.boolean().default(true),
});
export type SiteFooter = z.infer<typeof footerSchema>;

export const socialSchema = z.object(Object.fromEntries(SOCIAL_NETWORKS.map((network) => [network, text(200)])) as Record<SocialNetwork, ReturnType<typeof text>>);
export type SiteSocial = z.infer<typeof socialSchema>;

export const whatsappButtonSchema = z.object({
  enabled: z.boolean().default(false),
  number: text(40),
  /** Mensaje con el que se abre la conversación. */
  message: text(200),
  /** Texto junto al ícono (vacío = solo el ícono). */
  label: text(30),
});
export type WhatsappButton = z.infer<typeof whatsappButtonSchema>;

export const pageSchema = z.object({
  id,
  /** Nombre de la página: aparece en el menú y en la pestaña del navegador. */
  title: z.string().trim().min(1, 'Ponle nombre a la página').max(60),
  /** Dirección (`servicios`); la de inicio es siempre `''`. */
  slug: z.string().trim().max(PAGE_SLUG_MAX).default(''),
  /** Texto del menú si debe ser distinto del nombre (vacío = el nombre). */
  menuLabel: text(40),
  showInMenu: z.boolean().default(true),
  /** Oculta: no se publica ni aparece en el menú, pero se conserva en el editor. */
  hidden: z.boolean().default(false),
  seoTitle: text(70),
  seoDescription: text(200),
  blocks: blocksSchema.default([]),
});
export type SitePage = z.infer<typeof pageSchema>;

export const siteDocumentSchema = z
  .object({
    version: z.literal(SITE_DOCUMENT_VERSION).default(SITE_DOCUMENT_VERSION),
    pages: z.array(pageSchema).min(1, 'El sitio necesita al menos una página').max(MAX_PAGES, `Un sitio puede tener hasta ${MAX_PAGES} páginas`),
    header: headerSchema.prefault({}),
    footer: footerSchema.prefault({}),
    social: socialSchema.prefault({}),
    whatsapp: whatsappButtonSchema.prefault({}),
  })
  .superRefine((doc, ctx) => {
    const pageIds = new Set<string>();
    const slugs = new Set<string>();
    const blockIds = new Set<string>();
    let totalBlocks = 0;
    doc.pages.forEach((page, index) => {
      if (pageIds.has(page.id)) ctx.addIssue({ code: 'custom', message: 'Hay páginas repetidas', path: ['pages', index, 'id'] });
      pageIds.add(page.id);
      if (index > 0) {
        const problem = pageSlugProblem(page.slug);
        if (problem) ctx.addIssue({ code: 'custom', message: `Página «${page.title}»: ${problem.toLowerCase()}`, path: ['pages', index, 'slug'] });
        else if (slugs.has(page.slug)) ctx.addIssue({ code: 'custom', message: `Dos páginas usan la dirección «${page.slug}»`, path: ['pages', index, 'slug'] });
        slugs.add(page.slug);
      }
      for (const block of page.blocks) {
        if (blockIds.has(block.id)) ctx.addIssue({ code: 'custom', message: 'Hay secciones repetidas entre páginas', path: ['pages', index, 'blocks'] });
        blockIds.add(block.id);
      }
      totalBlocks += page.blocks.length;
    });
    if (totalBlocks > MAX_TOTAL_BLOCKS) ctx.addIssue({ code: 'custom', message: `El sitio puede tener hasta ${MAX_TOTAL_BLOCKS} secciones en total`, path: ['pages'] });
    if (JSON.stringify(doc).length > MAX_DOCUMENT_BYTES) ctx.addIssue({ code: 'custom', message: 'El sitio es demasiado grande. Divide el contenido o quita secciones que no uses.', path: ['pages'] });
  });

export type SiteDocument = z.infer<typeof siteDocumentSchema>;

// ---------------------------------------------------------------------------
// Ids y creación
// ---------------------------------------------------------------------------

export function newPageId(): string {
  return `p${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export function newLinkId(): string {
  return `l${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

export const DEFAULT_HEADER: SiteHeader = headerSchema.parse({});
export const DEFAULT_FOOTER: SiteFooter = footerSchema.parse({});

/** Página de inicio con estas secciones. */
export function homePage(blocks: WebSiteBlock[]): SitePage {
  return pageSchema.parse({ id: newPageId(), title: 'Inicio', slug: '', blocks });
}

/** Sitio de una página a partir de una lista de secciones (formato antiguo o plantillas). */
export function documentFromBlocks(blocks: WebSiteBlock[], legacyTheme?: unknown): SiteDocument {
  const theme = parseTheme(legacyTheme);
  return {
    version: SITE_DOCUMENT_VERSION,
    // Id fijo para que el mismo sitio antiguo se lea siempre igual (comparar borrador y publicado).
    pages: [pageSchema.parse({ id: 'home', title: 'Inicio', slug: '', blocks })],
    header: headerSchema.parse({ enabled: theme.showNav }),
    footer: footerSchema.parse({ text: theme.footerText }),
    social: socialSchema.parse({}),
    whatsapp: whatsappButtonSchema.parse({}),
  };
}

// ---------------------------------------------------------------------------
// Lectura tolerante
// ---------------------------------------------------------------------------

function tolerant<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const whole = schema.safeParse(raw ?? {});
  if (whole.success) return whole.data;
  // Campo por campo: un dato dañado no borra el resto del encabezado o del pie.
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const shape: Record<string, z.ZodType> = schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodType>) : {};
  const fixed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const field = shape[key];
    if (!field) continue;
    const single = field.safeParse(value);
    if (single.success) fixed[key] = single.data;
    else if (Array.isArray(value)) {
      // Listas (menú, columnas): se conservan los elementos sanos.
      const inner = field instanceof z.ZodDefault ? field.unwrap() : field;
      if (inner instanceof z.ZodArray) {
        const element = inner.element as z.ZodType;
        fixed[key] = value.map((entry) => element.safeParse(entry)).flatMap((result) => (result.success ? [result.data] : []));
      }
    }
  }
  const retry = schema.safeParse(fixed);
  return retry.success ? retry.data : schema.parse({});
}

/** Dirección de página única y válida a partir de lo guardado o del nombre. */
function uniquePageSlug(wanted: string, title: string, used: Set<string>): string {
  let slug = isValidPageSlug(wanted) ? wanted : slugify(title, PAGE_SLUG_MAX);
  if (!isValidPageSlug(slug)) slug = slug ? `${slug.slice(0, PAGE_SLUG_MAX - 7)}-pagina` : 'pagina';
  if (!isValidPageSlug(slug)) slug = 'pagina';
  let candidate = slug;
  for (let n = 2; used.has(candidate); n += 1) candidate = `${slug.slice(0, PAGE_SLUG_MAX - 4)}-${n}`;
  used.add(candidate);
  return candidate;
}

/**
 * JSON guardado → documento válido. Acepta el formato antiguo (lista de
 * secciones) y repara lo reparable: páginas o secciones dañadas se descartan,
 * direcciones repetidas o inválidas se corrigen, y nunca queda sin página de
 * inicio. `legacyTheme` solo se usa para convertir un sitio antiguo.
 */
export function parseSiteDocument(raw: unknown, legacyTheme?: unknown): SiteDocument {
  if (Array.isArray(raw)) return documentFromBlocks(parseBlocks(raw), legacyTheme);
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawPages = Array.isArray(source.pages) ? source.pages.slice(0, MAX_PAGES) : [];

  const pages: SitePage[] = [];
  const pageIds = new Set<string>();
  const blockIds = new Set<string>();
  const slugs = new Set<string>();
  let totalBlocks = 0;
  for (const item of rawPages) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const pageId = typeof record.id === 'string' && /^[\w-]{1,40}$/.test(record.id) && !pageIds.has(record.id) ? record.id : newPageId();
    const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim().slice(0, 60) : pages.length === 0 ? 'Inicio' : 'Página';
    const blocks = parseBlocks(record.blocks)
      .filter((block) => !blockIds.has(block.id))
      .slice(0, Math.max(0, Math.min(MAX_BLOCKS, MAX_TOTAL_BLOCKS - totalBlocks)));
    blocks.forEach((block) => blockIds.add(block.id));
    totalBlocks += blocks.length;
    const rest = pageSchema.omit({ id: true, title: true, blocks: true, slug: true }).safeParse(record);
    const meta = rest.success ? rest.data : pageSchema.omit({ id: true, title: true, blocks: true, slug: true }).parse({});
    const slug = pages.length === 0 ? '' : uniquePageSlug(typeof record.slug === 'string' ? record.slug : '', title, slugs);
    pageIds.add(pageId);
    pages.push({ ...meta, id: pageId, title, slug, blocks });
  }
  if (pages.length === 0) pages.push(pageSchema.parse({ id: 'home', title: 'Inicio', slug: '', blocks: [] }));
  // La de inicio siempre se publica: ocultarla dejaría el sitio sin portada.
  pages[0] = { ...pages[0]!, slug: '', hidden: false };

  return {
    version: SITE_DOCUMENT_VERSION,
    pages,
    header: tolerant(headerSchema, source.header),
    footer: tolerant(footerSchema, source.footer),
    social: tolerant(socialSchema, source.social),
    whatsapp: tolerant(whatsappButtonSchema, source.whatsapp),
  };
}

/** Deja el documento listo para guardar: mismas reparaciones que al leer. */
export function normalizeSiteDocument(doc: SiteDocument): SiteDocument {
  return parseSiteDocument(JSON.parse(JSON.stringify(doc)));
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function homeOf(doc: SiteDocument): SitePage {
  return doc.pages[0]!;
}

/** Páginas que se publican (la de inicio siempre). */
export function publishedPages(doc: SiteDocument): SitePage[] {
  return doc.pages.filter((page, index) => index === 0 || !page.hidden);
}

export function findPageBySlug(doc: SiteDocument, slug: string): SitePage | null {
  if (!slug) return homeOf(doc);
  return publishedPages(doc).find((page) => page.slug === slug) ?? null;
}

export function findPage(doc: SiteDocument, pageId: string): SitePage | null {
  return doc.pages.find((page) => page.id === pageId) ?? null;
}

export function allBlocks(doc: SiteDocument): WebSiteBlock[] {
  return doc.pages.flatMap((page) => page.blocks);
}

/** Secciones visibles de las páginas que se publican. */
export function visibleBlocks(doc: SiteDocument): WebSiteBlock[] {
  return publishedPages(doc).flatMap((page) => page.blocks.filter((block) => !block.hidden));
}

/** Texto con que la página aparece en el menú. */
export function pageMenuLabel(page: SitePage): string {
  return page.menuLabel.trim() || page.title;
}

/** Dirección relativa de una página. `basePath` es `/web/mi-sitio` en la plataforma o `''` en un dominio propio. */
export function pagePath(page: SitePage, doc: SiteDocument, basePath: string): string {
  const home = page.id === homeOf(doc).id;
  if (home) return basePath || '/';
  return `${basePath}/${page.slug}`;
}

// ---------------------------------------------------------------------------
// Enlaces
// ---------------------------------------------------------------------------

const PAGE_LINK_RE = /^page:([\w-]{1,40})(?:#([\w-]{1,60}))?$/;

/** `page:<id>` o `page:<id>#ancla` → partes; `null` si no es un enlace interno. */
export function parsePageLink(raw: string): { pageId: string; anchor: string | null } | null {
  const match = PAGE_LINK_RE.exec(raw.trim());
  return match ? { pageId: match[1]!, anchor: match[2] ?? null } : null;
}

export function pageLink(pageId: string, anchor?: string | null): string {
  return anchor ? `page:${pageId}#${anchor}` : `page:${pageId}`;
}

export interface LinkContext {
  doc: SiteDocument;
  /** Página en la que está el enlace (un `#ancla` suelto es de esta página). */
  pageId: string;
  basePath: string;
}

export interface ResolvedLink {
  href: string;
  /** Sale del sitio (se abre en pestaña nueva salvo que se diga otra cosa). */
  external: boolean;
  /** Página del sitio a la que lleva (para que la vista previa navegue sin salir del editor). */
  pageId: string | null;
  anchor: string | null;
}

/**
 * Enlace escrito por el usuario → dirección segura, o `null` si no sirve
 * (página borrada u oculta, esquema peligroso, texto que no es enlace).
 */
export function resolveLink(raw: string | null | undefined, ctx: LinkContext): ResolvedLink | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const internal = parsePageLink(value);
  if (internal) {
    const target = publishedPages(ctx.doc).find((page) => page.id === internal.pageId);
    if (!target) return null;
    const hash = internal.anchor ? `#${internal.anchor}` : '';
    if (target.id === ctx.pageId && internal.anchor) return { href: hash, external: false, pageId: target.id, anchor: internal.anchor };
    return { href: `${pagePath(target, ctx.doc, ctx.basePath)}${hash}`, external: false, pageId: target.id, anchor: internal.anchor };
  }
  const safe = safeHref(value);
  if (!safe) return null;
  if (safe.startsWith('#')) return { href: safe, external: false, pageId: ctx.pageId, anchor: safe.slice(1) };
  return { href: safe, external: isExternalHref(safe), pageId: null, anchor: null };
}

/** ¿El enlace es válido dentro de este sitio? (para avisar antes de publicar). */
export function isValidSiteLink(raw: string, doc: SiteDocument): boolean {
  const internal = parsePageLink(raw);
  if (internal) return publishedPages(doc).some((page) => page.id === internal.pageId);
  return safeHref(raw) !== null;
}

/** Anclas (secciones) de una página, para elegir "ir a una sección". */
export function pageAnchors(page: SitePage): { anchor: string; label: string }[] {
  return buildNav(page.blocks).map((entry) => ({ anchor: entry.anchor, label: entry.label }));
}

/** Ancla de cada sección visible de una página (la misma que usa el renderizador). */
export function pageBlockAnchors(page: SitePage): Map<string, string> {
  return blockAnchors(page.blocks.filter((block) => !block.hidden));
}

// ---------------------------------------------------------------------------
// Menú
// ---------------------------------------------------------------------------

export interface SiteNavItem {
  key: string;
  label: string;
  /** Enlace sin resolver (`page:…`, `#…`, `https://…`). */
  href: string;
  newTab: boolean;
  children: SiteNavItem[];
}

/**
 * Menú del encabezado. En modo automático: las páginas publicadas que van en
 * el menú; si el sitio tiene una sola página, sus secciones con título (como
 * en el primer formato). En modo propio: lo que armó el usuario.
 */
export function siteMenu(doc: SiteDocument, pageId: string): SiteNavItem[] {
  if (doc.header.menuMode === 'custom') {
    return doc.header.menu
      .filter((item) => item.label.trim())
      .map((item) => ({
        key: item.id,
        label: item.label,
        href: item.href,
        newTab: item.newTab,
        children: item.children.filter((child) => child.label.trim() && child.href.trim()).map((child) => ({ key: child.id, label: child.label, href: child.href, newTab: child.newTab, children: [] })),
      }))
      .filter((item) => item.href.trim() || item.children.length > 0);
  }
  const pages = publishedPages(doc).filter((page) => page.showInMenu);
  if (publishedPages(doc).length > 1) {
    return pages.map((page) => ({ key: page.id, label: pageMenuLabel(page), href: pageLink(page.id), newTab: false, children: [] }));
  }
  const current = findPage(doc, pageId) ?? homeOf(doc);
  return buildNav(current.blocks).map((entry) => ({ key: entry.anchor, label: entry.label, href: `#${entry.anchor}`, newTab: false, children: [] }));
}

/** Menú automático convertido en editable (el punto de partida al pasar a "menú propio"). */
export function autoMenuItems(doc: SiteDocument): MenuItem[] {
  const pages = publishedPages(doc).filter((page) => page.showInMenu);
  if (pages.length > 1) return pages.slice(0, MAX_MENU_ITEMS).map((page) => menuItemSchema.parse({ id: newLinkId(), label: pageMenuLabel(page).slice(0, 40), href: pageLink(page.id) }));
  const home = homeOf(doc);
  return buildNav(home.blocks)
    .slice(0, MAX_MENU_ITEMS)
    .map((entry) => menuItemSchema.parse({ id: newLinkId(), label: entry.label.slice(0, 40), href: pageLink(home.id, entry.anchor) }));
}

/** Todos los enlaces del encabezado, pie y menú, con un nombre para el usuario. */
export function chromeLinks(doc: SiteDocument): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  if (doc.header.enabled) {
    if (doc.header.ctaHref.trim()) out.push({ label: `el botón «${doc.header.ctaLabel || 'del encabezado'}» del encabezado`, href: doc.header.ctaHref });
    if (doc.header.announcement.enabled && doc.header.announcement.href.trim()) out.push({ label: 'el enlace de la barra de anuncio', href: doc.header.announcement.href });
    if (doc.header.menuMode === 'custom') {
      for (const item of doc.header.menu) {
        if (item.href.trim()) out.push({ label: `el ítem «${item.label || 'sin nombre'}» del menú`, href: item.href });
        for (const child of item.children) if (child.href.trim()) out.push({ label: `el ítem «${child.label || 'sin nombre'}» del submenú «${item.label}»`, href: child.href });
      }
    }
  }
  if (doc.footer.enabled && doc.footer.layout === 'columns') {
    for (const column of doc.footer.columns) for (const entry of column.links) if (entry.href.trim()) out.push({ label: `el enlace «${entry.label || 'sin nombre'}» del pie`, href: entry.href });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Operaciones del editor (puras: devuelven un documento nuevo)
// ---------------------------------------------------------------------------

/** Nueva página al final con estas secciones; el nombre se vuelve dirección única. */
export function addPage(doc: SiteDocument, input: { title: string; blocks?: WebSiteBlock[]; slug?: string }): { doc: SiteDocument; page: SitePage } {
  const used = new Set(doc.pages.slice(1).map((page) => page.slug));
  const title = input.title.trim().slice(0, 60) || 'Página nueva';
  const page = pageSchema.parse({ id: newPageId(), title, slug: uniquePageSlug(input.slug ?? '', title, used), blocks: input.blocks ?? [] });
  return { doc: { ...doc, pages: [...doc.pages, page] }, page };
}

/** Copia de una página (secciones con ids nuevos) justo después de la original. */
export function duplicatePage(doc: SiteDocument, pageId: string): { doc: SiteDocument; page: SitePage } | null {
  const index = doc.pages.findIndex((page) => page.id === pageId);
  const source = doc.pages[index];
  if (!source) return null;
  const used = new Set(doc.pages.slice(1).map((page) => page.slug));
  const title = `${source.title} (copia)`.slice(0, 60);
  const page: SitePage = { ...structuredClone(source), id: newPageId(), title, slug: uniquePageSlug(`${source.slug || 'inicio'}-copia`, title, used), blocks: source.blocks.map(cloneBlock) };
  const pages = [...doc.pages];
  pages.splice(index + 1, 0, page);
  return { doc: { ...doc, pages }, page };
}

/** Quita los enlaces a una página borrada (menú propio y columnas del pie). */
function withoutLinksTo(doc: SiteDocument, pageId: string): SiteDocument {
  const keep = (href: string) => parsePageLink(href)?.pageId !== pageId;
  return {
    ...doc,
    header: {
      ...doc.header,
      menu: doc.header.menu.filter((item) => keep(item.href) || item.children.some((child) => keep(child.href))).map((item) => ({ ...item, href: keep(item.href) ? item.href : '', children: item.children.filter((child) => keep(child.href)) })),
    },
    footer: { ...doc.footer, columns: doc.footer.columns.map((column) => ({ ...column, links: column.links.filter((entry) => keep(entry.href)) })) },
  };
}

export function removePage(doc: SiteDocument, pageId: string): SiteDocument {
  if (doc.pages.length <= 1 || doc.pages[0]?.id === pageId) return doc;
  return withoutLinksTo({ ...doc, pages: doc.pages.filter((page) => page.id !== pageId) }, pageId);
}

/** Mueve una página; la de inicio no se mueve ni se reemplaza por esta vía. */
export function movePage(doc: SiteDocument, pageId: string, dir: -1 | 1): SiteDocument {
  const index = doc.pages.findIndex((page) => page.id === pageId);
  const target = index + dir;
  if (index <= 0 || target <= 0 || target >= doc.pages.length) return doc;
  const pages = [...doc.pages];
  const [moved] = pages.splice(index, 1);
  pages.splice(target, 0, moved!);
  return { ...doc, pages };
}

/** Convierte otra página en la de inicio (la actual pasa a ser una página más con dirección propia). */
export function setHomePage(doc: SiteDocument, pageId: string): SiteDocument {
  const index = doc.pages.findIndex((page) => page.id === pageId);
  if (index <= 0) return doc;
  const pages = [...doc.pages];
  const [next] = pages.splice(index, 1);
  const previousHome = pages[0]!;
  const used = new Set(pages.slice(1).map((page) => page.slug));
  pages[0] = { ...previousHome, slug: uniquePageSlug(slugify(previousHome.title, PAGE_SLUG_MAX) || 'inicio', previousHome.title, used) };
  return { ...doc, pages: [{ ...next!, slug: '', hidden: false }, ...pages] };
}

export function updatePage(doc: SiteDocument, pageId: string, patch: Partial<Omit<SitePage, 'id'>>): SiteDocument {
  return { ...doc, pages: doc.pages.map((page, index) => (page.id === pageId ? { ...page, ...patch, ...(index === 0 ? { slug: '', hidden: false } : {}) } : page)) };
}

export function setPageBlocks(doc: SiteDocument, pageId: string, updater: (blocks: WebSiteBlock[]) => WebSiteBlock[]): SiteDocument {
  return { ...doc, pages: doc.pages.map((page) => (page.id === pageId ? { ...page, blocks: updater(page.blocks) } : page)) };
}

/** Total de secciones del sitio. */
export function blockCount(doc: SiteDocument): number {
  return doc.pages.reduce((sum, page) => sum + page.blocks.length, 0);
}

/** ¿La página tiene algo que mostrar? */
export function pageHasContent(page: SitePage): boolean {
  return page.blocks.some((block) => !block.hidden && !isBlockEmpty(block));
}

/** Valida un bloque suelto (p. ej. al pegar una sección copiada). */
export function parseBlock(raw: unknown): WebSiteBlock | null {
  const parsed = blockSchema.safeParse(raw);
  return parsed.success ? { ...parsed.data, id: newBlockId() } : null;
}

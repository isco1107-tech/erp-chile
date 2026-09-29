import { blockLinks, type WebSiteBlock } from '@/lib/web-sites/blocks';
import type { PageTemplate } from '@/lib/web-sites/page-templates';
import { addPage, MAX_PAGES, pageAnchors, pageBlockAnchors, pageLink, parsePageLink, publishedPages, setPageBlocks, type SiteDocument, type SitePage } from '@/lib/web-sites/site';
import { templateBlocks } from '@/lib/web-sites/templates';
import { whatsappHref } from '@/lib/web-sites/urls';

/**
 * Lógica pura del panel de páginas: agregar una página desde una plantilla
 * dejando sus botones apuntando a algo útil, y contar los enlaces que llevan
 * a una página (para avisar antes de borrarla).
 */

/**
 * ¿A dónde deberían llevar los botones de una página nueva que no traen enlace?
 * Prefiere la sección de contacto del sitio (con título, para poder bajar
 * hasta ella) y, si no hay, el WhatsApp del botón flotante. `''` si no hay nada
 * razonable: entonces los botones quedan sin enlace y se avisa.
 */
export function defaultButtonTarget(doc: SiteDocument): string {
  for (const page of publishedPages(doc)) {
    const contact = page.blocks.find((block) => block.type === 'contact' && !block.hidden);
    if (!contact) continue;
    const anchor = pageBlockAnchors(page).get(contact.id);
    // Solo las secciones con título tienen un ancla en la lista de secciones de la página.
    if (anchor && pageAnchors(page).some((entry) => entry.anchor === anchor)) return pageLink(page.id, anchor);
  }
  if (doc.whatsapp.enabled) return whatsappHref(doc.whatsapp.number, doc.whatsapp.message || undefined) ?? '';
  return '';
}

interface Filled {
  block: WebSiteBlock;
  filled: number;
  pending: number;
}

/** Un botón "con texto y sin enlace" recibe `href`; devuelve cuántos se llenaron y cuántos quedaron sin destino. */
function fillBlock(block: WebSiteBlock, href: string): Filled {
  const needs = (label: string, target: string) => label.trim() !== '' && target.trim() === '';
  switch (block.type) {
    case 'hero': {
      if (!needs(block.ctaLabel, block.ctaHref)) return { block, filled: 0, pending: 0 };
      return href ? { block: { ...block, ctaHref: href }, filled: 1, pending: 0 } : { block, filled: 0, pending: 1 };
    }
    case 'cta': {
      if (!needs(block.buttonLabel, block.buttonHref)) return { block, filled: 0, pending: 0 };
      return href ? { block: { ...block, buttonHref: href }, filled: 1, pending: 0 } : { block, filled: 0, pending: 1 };
    }
    case 'pricing': {
      let filled = 0;
      let pending = 0;
      const items = block.items.map((item) => {
        if (!needs(item.buttonLabel, item.buttonHref)) return item;
        if (!href) {
          pending += 1;
          return item;
        }
        filled += 1;
        return { ...item, buttonHref: href };
      });
      return filled > 0 ? { block: { ...block, items }, filled, pending } : { block, filled, pending };
    }
    default:
      return { block, filled: 0, pending: 0 };
  }
}

/** Rellena los botones sin enlace de estas secciones. */
export function fillEmptyButtons(blocks: WebSiteBlock[], href: string): { blocks: WebSiteBlock[]; filled: number; pending: number } {
  let filled = 0;
  let pending = 0;
  const next = blocks.map((block) => {
    const result = fillBlock(block, href);
    filled += result.filled;
    pending += result.pending;
    return result.block;
  });
  return { blocks: next, filled, pending };
}

export interface AddedPage {
  doc: SiteDocument;
  page: SitePage;
  /** Botones a los que se les puso enlace solos. */
  linkedButtons: number;
  /** A dónde se enlazaron (`page:…` = sección de contacto; otro = WhatsApp); `''` si no había dónde. */
  target: string;
  /** Botones que quedaron sin enlace porque el sitio aún no tiene contacto ni WhatsApp. */
  unlinkedButtons: number;
}

/** Página nueva desde una plantilla (o en blanco), con los botones ya enlazados a la sección de contacto. */
export function addPageFromTemplate(doc: SiteDocument, template: PageTemplate, title: string): AddedPage | null {
  if (doc.pages.length >= MAX_PAGES) return null;
  const name = title.trim() || template.title;
  const added = addPage(doc, { title: name, blocks: templateBlocks(template.blocks) });
  // El destino se busca con la página ya agregada: si la plantilla trae su propio contacto (la de "Contacto"), sirve.
  const target = defaultButtonTarget(added.doc);
  const filled = fillEmptyButtons(added.page.blocks, target);
  const page: SitePage = { ...added.page, blocks: filled.blocks };
  return { doc: setPageBlocks(added.doc, page.id, () => filled.blocks), page, linkedButtons: filled.filled, target, unlinkedButtons: filled.pending };
}

export interface PageLinkCount {
  /** Ítems del menú propio y del pie: al borrar la página, el sitio los quita solo. */
  cleaned: number;
  /** Botones de secciones, botón destacado y anuncio: quedan sin destino y hay que cambiarlos a mano. */
  manual: number;
}

/**
 * Cuántos enlaces del sitio llevan a esta página, separados entre los que se
 * limpian solos al borrarla (menú propio y pie) y los que no. Los botones de
 * la propia página no cuentan: se van con ella.
 */
export function countLinksTo(doc: SiteDocument, pageId: string): PageLinkCount {
  const points = (href: string) => (parsePageLink(href)?.pageId === pageId ? 1 : 0);
  let cleaned = 0;
  let manual = 0;
  for (const page of doc.pages) {
    if (page.id === pageId) continue;
    for (const block of page.blocks) for (const found of blockLinks(block)) manual += points(found.href);
  }
  for (const item of doc.header.menu) {
    cleaned += points(item.href);
    for (const child of item.children) cleaned += points(child.href);
  }
  for (const column of doc.footer.columns) for (const entry of column.links) cleaned += points(entry.href);
  manual += points(doc.header.ctaHref);
  manual += points(doc.header.announcement.href);
  return { cleaned, manual };
}

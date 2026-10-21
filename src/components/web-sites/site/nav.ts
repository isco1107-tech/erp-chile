import { siteMenu, type ResolvedLink } from '@/lib/web-sites/site';
import { resolveIn, type RenderCtx } from './context';

export interface NavChild {
  key: string;
  label: string;
  link: ResolvedLink;
  newTab: boolean;
  current: boolean;
}

export interface NavItem {
  key: string;
  label: string;
  /** Destino propio; `null` si el ítem solo abre un submenú. */
  link: ResolvedLink | null;
  newTab: boolean;
  current: boolean;
  children: NavChild[];
}

/** ¿El enlace lleva a la página que se está viendo (sin ancla)? Es lo que marca `aria-current="page"`. */
function isCurrent(ctx: RenderCtx, link: ResolvedLink | null): boolean {
  return Boolean(link && !link.external && link.pageId === ctx.page.id && !link.anchor);
}

/** Un ancla de esta página que no se pinta (sección vacía u oculta) no debe quedar en el menú apuntando a nada. */
function dangling(ctx: RenderCtx, link: ResolvedLink | null, anchors: ReadonlySet<string>): boolean {
  return Boolean(link && link.pageId === ctx.page.id && link.anchor && !anchors.has(link.anchor));
}

/**
 * Menú del encabezado con cada enlace ya resuelto por `resolveLink`. Los ítems
 * sin destino válido (página borrada u oculta, `javascript:`…) se descartan; un
 * ítem sin destino pero con submenú se conserva como título del desplegable.
 */
export function buildNavItems(ctx: RenderCtx, anchors: ReadonlySet<string>): NavItem[] {
  const items: NavItem[] = [];
  for (const entry of siteMenu(ctx.doc, ctx.page.id)) {
    const link = resolveIn(ctx, entry.href);
    const children: NavChild[] = [];
    for (const child of entry.children) {
      const childLink = resolveIn(ctx, child.href);
      if (!childLink || dangling(ctx, childLink, anchors)) continue;
      children.push({ key: child.key, label: child.label, link: childLink, newTab: child.newTab, current: isCurrent(ctx, childLink) });
    }
    const usable = link && !dangling(ctx, link, anchors) ? link : null;
    if (!usable && children.length === 0) continue;
    items.push({ key: entry.key, label: entry.label, link: usable, newTab: entry.newTab, current: isCurrent(ctx, usable), children });
  }
  return items;
}

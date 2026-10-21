import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { ResolvedLink } from '@/lib/web-sites/site';
import type { RenderCtx } from './context';

/**
 * Enlace del sitio. En la página pública es un `<a>` normal; en la vista
 * previa nada navega de verdad: un enlace a otra página avisa al editor
 * (`onNavigate`), un ancla de la misma página hace scroll dentro de la vista
 * previa y lo demás no hace nada. El `href` SIEMPRE viene de `resolveLink`.
 */

interface SiteLinkProps {
  ctx: RenderCtx;
  /** Enlace ya resuelto; `null` = sin destino (se pinta el texto sin enlace). */
  link: ResolvedLink | null;
  /** Abrir en pestaña nueva aunque el destino sea de este mismo sitio (ítems del menú, botón del encabezado). */
  newTab?: boolean;
  className?: string;
  ariaCurrent?: 'page';
  ariaLabel?: string;
  children: ReactNode;
}

export const NEW_TAB_NOTICE = '(se abre en otra pestaña)';

/** Lleva la vista previa hasta una sección de la página, sin mover la ventana del panel más de lo necesario. */
function scrollToAnchor(from: Element, id: string): void {
  const root = from.closest('[data-ws-root]');
  const target = root?.querySelector(`[id="${id}"]`);
  if (!target) return;
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function activatePreview(ctx: RenderCtx, link: ResolvedLink, from: Element): void {
  if (!link.pageId || link.external) return;
  if (link.pageId === ctx.page.id && link.anchor) {
    scrollToAnchor(from, `${ctx.idPrefix}${link.anchor}`);
    return;
  }
  ctx.onNavigate?.(link.pageId, link.anchor);
}

export default function SiteLink({ ctx, link, newTab = false, className, ariaCurrent, ariaLabel, children }: SiteLinkProps) {
  if (!link) return <span className={className}>{children}</span>;

  if (ctx.preview) {
    // Sin destino navegable (externo, correo, teléfono, o clic reservado para seleccionar la sección): texto sin comportamiento.
    if (!ctx.navigate || !link.pageId || link.external) return <span className={className}>{children}</span>;
    return (
      <span
        role="link"
        tabIndex={0}
        aria-current={ariaCurrent}
        aria-label={ariaLabel}
        className={`${className ?? ''} cursor-pointer`}
        onClick={(event: MouseEvent<HTMLElement>) => {
          event.preventDefault();
          activatePreview(ctx, link, event.currentTarget);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          activatePreview(ctx, link, event.currentTarget);
        }}
      >
        {children}
      </span>
    );
  }

  const sameAnchor = link.href.startsWith('#');
  const opensNew = !sameAnchor && (link.external || (newTab && link.pageId !== null));
  return (
    <a href={link.href} className={className} aria-current={ariaCurrent} aria-label={ariaLabel} {...(opensNew ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
      {opensNew && <span className="sr-only"> {NEW_TAB_NOTICE}</span>}
    </a>
  );
}

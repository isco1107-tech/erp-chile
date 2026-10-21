import { ChevronDown } from 'lucide-react';
import { pageLink, homeOf } from '@/lib/web-sites/site';
import { SOCIAL_LABELS, SOCIAL_NETWORKS, socialHref } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from './context';
import { SocialIcon } from './icons';
import MobileMenu from './MobileMenu';
import { type NavItem } from './nav';
import { cx, Img } from './parts';
import SiteLink, { NEW_TAB_NOTICE } from './SiteLink';
import type { Tone } from './tone';

/** Íconos de las redes sociales con datos válidos (`socialHref` rechaza direcciones de otro sitio). */
export function SocialLinks({ ctx, className }: { ctx: RenderCtx; className?: string }) {
  const links = SOCIAL_NETWORKS.flatMap((network) => {
    const link = resolveIn(ctx, socialHref(network, ctx.doc.social[network]));
    return link ? [{ network, link }] : [];
  });
  if (links.length === 0) return null;
  return (
    <div className={cx('flex items-center gap-1', className)}>
      {links.map(({ network, link }) => (
        <SiteLink key={network} ctx={ctx} link={link} ariaLabel={`${SOCIAL_LABELS[network]} ${NEW_TAB_NOTICE}`} className="ws-navlink !p-2">
          <SocialIcon network={network} className="size-5" />
        </SiteLink>
      ))}
    </div>
  );
}

export function hasSocial(ctx: RenderCtx): boolean {
  return SOCIAL_NETWORKS.some((network) => socialHref(network, ctx.doc.social[network]) !== null);
}

const ANNOUNCEMENT_TONE = { accent: 'accent', primary: 'primary', dark: 'dark' } as const;

export function Announcement({ ctx }: { ctx: RenderCtx }) {
  const bar = ctx.doc.header.announcement;
  if (!bar.enabled || !bar.text) return null;
  const link = resolveIn(ctx, bar.href);
  return (
    <div className={cx('ws-bg relative z-30 px-5 py-2.5 text-center text-sm', `ws-tone-${ANNOUNCEMENT_TONE[bar.style]}`)}>
      <p className="mx-auto max-w-[var(--ws-max)]">
        <span>{bar.text}</span>
        {link && (
          <>
            {' '}
            <SiteLink ctx={ctx} link={link} className="font-semibold whitespace-nowrap underline underline-offset-4">
              {bar.linkLabel || 'Ver más'} →
            </SiteLink>
          </>
        )}
      </p>
    </div>
  );
}

// Clases completas (Tailwind no ve nombres armados a pedazos). El menú completo aparece cuando cabe.
const BREAKPOINTS = {
  '2xl': { px: 672, show: 'hidden @2xl:flex', hide: '@2xl:hidden', block: 'hidden @2xl:block', grid: '@2xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' },
  '4xl': { px: 896, show: 'hidden @4xl:flex', hide: '@4xl:hidden', block: 'hidden @4xl:block', grid: '@4xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' },
  '5xl': { px: 1024, show: 'hidden @5xl:flex', hide: '@5xl:hidden', block: 'hidden @5xl:block', grid: '@5xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' },
  '6xl': { px: 1152, show: 'hidden @6xl:flex', hide: '@6xl:hidden', block: 'hidden @6xl:block', grid: '@6xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' },
  '7xl': { px: 1280, show: 'hidden @7xl:flex', hide: '@7xl:hidden', block: 'hidden @7xl:block', grid: '@7xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]' },
  // Menú tan largo que no cabe en ninguna pantalla: queda siempre en el botón ☰.
  never: { px: Number.POSITIVE_INFINITY, show: 'hidden', hide: '', block: 'hidden', grid: '' },
} as const;

/**
 * Desde qué ancho cabe el menú completo en una fila: se estima con el largo
 * real de los textos (menú, botón, redes y espacio para el nombre), no con la
 * cantidad de ítems. Así un menú de muchas secciones no se aprieta ni se
 * encima con el logo: si no cabe en ninguna pantalla, queda en el botón ☰.
 */
/** Ancho máximo del contenido según el tema (`--ws-max`), en rem. */
const MAX_REM = { narrow: 56, normal: 64, wide: 80 } as const;

function menuBreakpoint(items: NavItem[], ctaLabel: string, social: boolean, layout: string, maxRem: number): (typeof BREAKPOINTS)[keyof typeof BREAKPOINTS] {
  const menu = items.reduce((sum, item) => sum + item.label.length * 8.4 + 30 + (item.children.length ? 18 : 0), 0);
  const extras = (ctaLabel ? ctaLabel.length * 8.6 + 48 : 0) + (social ? 132 : 0);
  // Centrado: el menú va en su propia fila. Clásico y dividido: comparte la fila con el nombre (se reserva espacio).
  const needed = layout === 'centered' ? Math.max(menu, extras + 260) + 72 : menu + extras + 260 + 72;
  const limit = maxRem * 16;
  for (const key of ['2xl', '4xl', '5xl', '6xl', '7xl'] as const) {
    const bp = BREAKPOINTS[key];
    // El contenido nunca pasa del ancho máximo del sitio: más pantalla no da más espacio.
    if (Math.min(bp.px, limit) >= needed) return bp;
    if (bp.px >= limit) break;
  }
  return BREAKPOINTS.never;
}

function Brand({ ctx, name, logoUrl, centered }: { ctx: RenderCtx; name: string; logoUrl: string | null; centered?: boolean }) {
  const header = ctx.doc.header;
  const home = resolveIn(ctx, pageLink(homeOf(ctx.doc).id));
  const showLogo = header.showLogo && logoUrl;
  const tagline = header.tagline;
  return (
    <SiteLink ctx={ctx} link={home} className={cx('flex min-w-0 items-center gap-3', centered && '@2xl:flex-col @2xl:gap-1.5 @2xl:text-center')}>
      {showLogo && <Img src={logoUrl} alt="" eager className="h-9 w-auto max-w-[9rem] shrink-0 object-contain @2xl:h-10" />}
      {header.showName ? (
        <span className="min-w-0">
          {/* Recorte con «…» a propósito: el nombre completo está en el pie y en el título de la página. Con logo, en pantallas angostas basta el logo. */}
          <span data-truncate="" className={cx('ws-h block truncate text-lg @2xl:text-xl', showLogo && '@max-md:sr-only')}>
            {name}
          </span>
          {tagline && (
            <span data-truncate="" className={cx('ws-muted block truncate text-xs', showLogo && '@max-md:hidden')}>
              {tagline}
            </span>
          )}
        </span>
      ) : (
        <>
          <span className="sr-only">{name}</span>
          {tagline && (
            <span data-truncate="" className="ws-muted block truncate text-xs">
              {tagline}
            </span>
          )}
        </>
      )}
    </SiteLink>
  );
}

function DesktopNav({ ctx, items, className }: { ctx: RenderCtx; items: NavItem[]; className: string }) {
  return (
    <nav aria-label="Principal" className={className}>
      <ul className="flex items-center gap-0.5">
        {items.map((item) => (
          <li key={item.key} className={cx(item.children.length > 0 && 'group/dd relative')}>
            {item.link ? (
              <SiteLink ctx={ctx} link={item.link} newTab={item.newTab} ariaCurrent={item.current ? 'page' : undefined} className="ws-navlink whitespace-nowrap">
                {item.label}
                {item.children.length > 0 && <ChevronDown className="size-4 opacity-70" aria-hidden="true" />}
              </SiteLink>
            ) : (
              <button type="button" aria-haspopup="true" className="ws-navlink cursor-default whitespace-nowrap">
                {item.label}
                <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
              </button>
            )}
            {item.children.length > 0 && (
              <div className="invisible absolute top-full left-0 z-40 min-w-56 pt-2 opacity-0 transition-opacity group-focus-within/dd:visible group-focus-within/dd:opacity-100 group-hover/dd:visible group-hover/dd:opacity-100">
                <ul className="ws-tone-default ws-bg rounded-[var(--ws-radius)] border border-[color:var(--s-line)] p-2 shadow-xl">
                  {item.children.map((child) => (
                    <li key={child.key}>
                      <SiteLink ctx={ctx} link={child.link} newTab={child.newTab} ariaCurrent={child.current ? 'page' : undefined} className="ws-navlink w-full">
                        {child.label}
                      </SiteLink>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MobileNav({ ctx, items, tone }: { ctx: RenderCtx; items: NavItem[]; tone: Tone }) {
  return (
    <nav aria-label="Principal" className={cx('ws-bg', `ws-tone-${tone}`)}>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.key}>
            {item.link ? (
              <SiteLink ctx={ctx} link={item.link} newTab={item.newTab} ariaCurrent={item.current ? 'page' : undefined} className="ws-navlink w-full text-base">
                {item.label}
              </SiteLink>
            ) : (
              <span className="ws-muted block px-3 pt-3 pb-1 text-xs font-semibold tracking-wider uppercase">{item.label}</span>
            )}
            {item.children.length > 0 && (
              <ul className="mb-1 ml-4 border-l border-[color:var(--s-line)] pl-2">
                {item.children.map((child) => (
                  <li key={child.key}>
                    <SiteLink ctx={ctx} link={child.link} newTab={child.newTab} ariaCurrent={child.current ? 'page' : undefined} className="ws-navlink w-full">
                      {child.label}
                    </SiteLink>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface HeaderProps {
  ctx: RenderCtx;
  name: string;
  logoUrl: string | null;
  items: NavItem[];
  /** Encabezado transparente sobre la portada: tono de la portada. `null` = encabezado normal. */
  overlayTone: Tone | null;
}

export default function SiteHeader({ ctx, name, logoUrl, items, overlayTone }: HeaderProps) {
  const header = ctx.doc.header;
  const overlay = header.style === 'transparent' && overlayTone !== null;
  const floating = header.style === 'floating';
  const solid = header.style === 'primary' || header.style === 'dark';
  const tone: Tone = overlay ? (overlayTone ?? 'default') : header.style === 'primary' ? 'primary' : header.style === 'dark' ? 'dark' : 'default';
  const social = header.showSocial && hasSocial(ctx);
  const cta = header.ctaLabel ? resolveIn(ctx, header.ctaHref) : null;
  const minimal = header.layout === 'minimal';
  const centered = header.layout === 'centered';
  const split = header.layout === 'split';

  const bp = menuBreakpoint(items, cta ? header.ctaLabel : '', social, header.layout, MAX_REM[ctx.siteWidth ?? 'normal']);
  const hasMenu = items.length > 0 || social;

  const ctaButton = cta && (
    <SiteLink ctx={ctx} link={cta} newTab={header.ctaNewTab} className="ws-btn ws-btn-main ws-btn-sm max-w-[10rem] whitespace-nowrap @2xl:max-w-none">
      {header.ctaLabel}
    </SiteLink>
  );
  const panelBase = 'ws-bg absolute inset-x-0 top-full max-h-[70dvh] overflow-y-auto border-b border-[color:var(--s-line)] px-5 py-4 shadow-xl';
  const panelTone: Tone = solid ? tone : 'default';
  const panelClass = cx(panelBase, `ws-tone-${panelTone}`, (minimal || floating) && '@2xl:inset-x-auto @2xl:right-8 @2xl:w-80 @2xl:rounded-b-[var(--ws-radius)] @2xl:border-x', floating && 'mt-2 rounded-[var(--ws-radius)] border-x');
  const menu = hasMenu && (
    <MobileMenu className={minimal ? undefined : bp.hide} panelClassName={panelClass}>
      <MobileNav ctx={ctx} items={items} tone={panelTone} />
      {social && <SocialLinks ctx={ctx} className="mt-3 border-t border-[color:var(--s-line)] pt-3" />}
    </MobileMenu>
  );

  const shell = cx(
    `ws-tone-${tone}`,
    'z-30 w-full',
    overlay
      ? 'absolute inset-x-0 top-0'
      : floating
        ? cx('px-3 pt-3 @2xl:px-6', header.sticky ? 'sticky top-0' : 'relative')
        : cx(solid ? 'ws-bg' : 'ws-glass border-b border-[color:var(--s-line)]', header.sticky ? 'sticky top-0' : 'relative')
  );

  const pad = floating ? 'px-4 py-2.5 @2xl:px-6' : 'px-5 py-3 @2xl:px-8';
  const inner = minimal ? (
    <div className={cx('mx-auto flex max-w-[var(--ws-max)] items-center justify-between gap-3', pad)}>
      <Brand ctx={ctx} name={name} logoUrl={logoUrl} />
      <div className="flex shrink-0 items-center gap-2">
        {ctaButton}
        {menu}
      </div>
    </div>
  ) : centered ? (
    <div className={cx('mx-auto max-w-[var(--ws-max)]', pad)}>
      <div className="flex items-center justify-between gap-3">
        {social && <SocialLinks ctx={ctx} className={cx(bp.show, 'flex-1')} />}
        {!social && <div className={cx(bp.block, 'flex-1')} />}
        <Brand ctx={ctx} name={name} logoUrl={logoUrl} centered />
        <div className="flex flex-1 shrink-0 items-center justify-end gap-2">
          {ctaButton}
          {menu}
        </div>
      </div>
      {items.length > 0 && <DesktopNav ctx={ctx} items={items} className={cx(bp.show, 'justify-center pt-2')} />}
    </div>
  ) : split ? (
    <div className={cx('mx-auto grid max-w-[var(--ws-max)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3', bp.grid, pad)}>
      {items.length > 0 ? <DesktopNav ctx={ctx} items={items} className={cx(bp.show, 'min-w-0 justify-start')} /> : <div className={bp.block} />}
      <div className="min-w-0">
        <Brand ctx={ctx} name={name} logoUrl={logoUrl} centered />
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {social && <SocialLinks ctx={ctx} className={bp.show} />}
        {ctaButton}
        {menu}
      </div>
    </div>
  ) : (
    <div className={cx('mx-auto flex max-w-[var(--ws-max)] items-center gap-3', pad)}>
      <div className="mr-auto min-w-0">
        <Brand ctx={ctx} name={name} logoUrl={logoUrl} />
      </div>
      {items.length > 0 && <DesktopNav ctx={ctx} items={items} className={bp.show} />}
      {social && <SocialLinks ctx={ctx} className={bp.show} />}
      {ctaButton}
      {menu}
    </div>
  );

  const bar = (
    <header className={shell}>
      {floating ? <div className="ws-glass relative mx-auto max-w-[calc(var(--ws-max)+1rem)] rounded-[calc(var(--ws-radius)+0.5rem)] border border-[color:var(--s-line)] shadow-lg">{inner}</div> : inner}
    </header>
  );
  // Transparente: va superpuesto (no fijo) sobre la portada, en un contenedor sin altura.
  return overlay ? <div className="relative z-30 h-0">{bar}</div> : bar;
}

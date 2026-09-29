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
  '2xl': { show: 'hidden @2xl:flex', hide: '@2xl:hidden', block: 'hidden @2xl:block' },
  '4xl': { show: 'hidden @4xl:flex', hide: '@4xl:hidden', block: 'hidden @4xl:block' },
  '5xl': { show: 'hidden @5xl:flex', hide: '@5xl:hidden', block: 'hidden @5xl:block' },
} as const;

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
          <span className="ws-h block truncate text-lg @2xl:text-xl">{name}</span>
          {tagline && <span className="ws-muted block truncate text-xs">{tagline}</span>}
        </span>
      ) : (
        <>
          <span className="sr-only">{name}</span>
          {tagline && <span className="ws-muted block truncate text-xs">{tagline}</span>}
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
              <SiteLink ctx={ctx} link={item.link} newTab={item.newTab} ariaCurrent={item.current ? 'page' : undefined} className="ws-navlink">
                {item.label}
                {item.children.length > 0 && <ChevronDown className="size-4 opacity-70" aria-hidden="true" />}
              </SiteLink>
            ) : (
              <button type="button" aria-haspopup="true" className="ws-navlink cursor-default">
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
  const variant = overlay ? 'transparent' : header.style === 'primary' ? 'primary' : 'light';
  const tone: Tone = overlay ? (overlayTone ?? 'default') : variant === 'primary' ? 'primary' : 'default';
  const social = header.showSocial && hasSocial(ctx);
  const cta = header.ctaLabel ? resolveIn(ctx, header.ctaHref) : null;
  const minimal = header.layout === 'minimal';
  const centered = header.layout === 'centered';

  const weight = items.length + (cta ? 2 : 0) + (social ? 1 : 0);
  const bp = BREAKPOINTS[weight <= 5 ? '2xl' : weight <= 8 ? '4xl' : '5xl'];
  const hasMenu = items.length > 0 || social;

  const ctaButton = cta && (
    <SiteLink ctx={ctx} link={cta} newTab={header.ctaNewTab} className="ws-btn ws-btn-main ws-btn-sm max-w-[10rem] whitespace-nowrap @2xl:max-w-none">
      {header.ctaLabel}
    </SiteLink>
  );
  const panelBase = 'ws-bg absolute inset-x-0 top-full max-h-[70dvh] overflow-y-auto border-b border-[color:var(--s-line)] px-5 py-4 shadow-xl';
  const panelTone: Tone = variant === 'primary' ? 'primary' : 'default';
  const panelClass = cx(panelBase, `ws-tone-${panelTone}`, minimal && '@2xl:inset-x-auto @2xl:right-8 @2xl:w-80 @2xl:rounded-b-[var(--ws-radius)] @2xl:border-x');
  const menu = hasMenu && (
    <MobileMenu className={minimal ? undefined : bp.hide} panelClassName={panelClass}>
      <MobileNav ctx={ctx} items={items} tone={panelTone} />
      {social && <SocialLinks ctx={ctx} className="mt-3 border-t border-[color:var(--s-line)] pt-3" />}
    </MobileMenu>
  );

  const shell = cx(
    `ws-tone-${tone}`,
    'z-30 w-full',
    overlay ? 'absolute inset-x-0 top-0' : cx(variant === 'primary' ? 'ws-bg' : 'ws-glass border-b border-[color:var(--s-line)]', header.sticky ? 'sticky top-0' : 'relative')
  );

  const inner = minimal ? (
    <div className="mx-auto flex max-w-[var(--ws-max)] items-center justify-between gap-3 px-5 py-3 @2xl:px-8">
      <Brand ctx={ctx} name={name} logoUrl={logoUrl} />
      <div className="flex shrink-0 items-center gap-2">
        {ctaButton}
        {menu}
      </div>
    </div>
  ) : centered ? (
    <div className="mx-auto max-w-[var(--ws-max)] px-5 py-3 @2xl:px-8">
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
  ) : (
    <div className="mx-auto flex max-w-[var(--ws-max)] items-center gap-3 px-5 py-3 @2xl:px-8">
      <div className="mr-auto min-w-0">
        <Brand ctx={ctx} name={name} logoUrl={logoUrl} />
      </div>
      {items.length > 0 && <DesktopNav ctx={ctx} items={items} className={bp.show} />}
      {social && <SocialLinks ctx={ctx} className={bp.show} />}
      {ctaButton}
      {menu}
    </div>
  );

  const bar = <header className={shell}>{inner}</header>;
  // Transparente: va superpuesto (no fijo) sobre la portada, en un contenedor sin altura.
  return overlay ? <div className="relative z-30 h-0">{bar}</div> : bar;
}

import { pageLink, homeOf } from '@/lib/web-sites/site';
import { resolveIn, type RenderCtx } from './context';
import { hasSocial, SocialLinks } from './SiteHeader';
import { cx, Img } from './parts';
import SiteLink from './SiteLink';
import type { NavItem } from './nav';
import type { Tone } from './tone';

const FOOTER_TONE: Record<'light' | 'muted' | 'dark' | 'primary', Tone> = { light: 'default', muted: 'muted', dark: 'dark', primary: 'primary' };

/** Tono del pie según su estilo (lo usa también el borde con forma de la última sección). */
export function footerTone(style: keyof typeof FOOTER_TONE): Tone {
  return FOOTER_TONE[style];
}

export default function SiteFooter({ ctx, name, logoUrl, items }: { ctx: RenderCtx; name: string; logoUrl: string | null; items: NavItem[] }) {
  const footer = ctx.doc.footer;
  if (!footer.enabled) return null;
  const tone = FOOTER_TONE[footer.style];
  const legend = footer.text || `© ${new Date().getFullYear()} ${name}`;
  const social = footer.showSocial && hasSocial(ctx);
  const shell = cx('ws-bg border-t border-[color:var(--s-line)]', `ws-tone-${tone}`);

  if (footer.layout === 'simple') {
    return (
      <footer className={shell}>
        <div className={cx('mx-auto flex max-w-[var(--ws-max)] flex-col items-center gap-4 px-5 py-8 text-center text-sm @2xl:px-8', social && '@2xl:flex-row @2xl:justify-between @2xl:text-left')}>
          <p className="ws-muted">{legend}</p>
          {social && <SocialLinks ctx={ctx} />}
        </div>
      </footer>
    );
  }

  const home = resolveIn(ctx, pageLink(homeOf(ctx.doc).id));

  if (footer.layout === 'centered') {
    const menu = footer.showMenu ? items.filter((item) => item.label && item.link) : [];
    return (
      <footer className={shell}>
        <div className="mx-auto flex max-w-[var(--ws-max)] flex-col items-center px-5 py-12 text-center @2xl:px-8 @2xl:py-16">
          <SiteLink ctx={ctx} link={home} className="flex flex-col items-center gap-3">
            <Img src={logoUrl} alt="" className="h-12 w-auto max-w-[10rem] object-contain" />
            <span className="ws-h text-2xl">{name}</span>
          </SiteLink>
          {footer.about && <p className="ws-muted mt-4 max-w-xl text-sm leading-relaxed whitespace-pre-line">{footer.about}</p>}
          {menu.length > 0 && (
            <nav aria-label="Menú del sitio" className="mt-8">
              <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                {menu.map((item) =>
                  item.link ? (
                    <li key={item.key}>
                      <SiteLink ctx={ctx} link={item.link} newTab={item.newTab} className="ws-muted underline-offset-4 hover:underline">
                        {item.label}
                      </SiteLink>
                    </li>
                  ) : null
                )}
              </ul>
            </nav>
          )}
          {social && <SocialLinks ctx={ctx} className="mt-6 justify-center" />}
          <p className="ws-muted mt-10 border-t border-[color:var(--s-line)] pt-6 text-sm">{legend}</p>
        </div>
      </footer>
    );
  }

  const columns = footer.columns.map((column) => ({ ...column, links: column.links.flatMap((entry) => { const link = resolveIn(ctx, entry.href); return entry.label && link ? [{ entry, link }] : []; }) })).filter((column) => column.links.length > 0);
  const menu = footer.showMenu ? items.filter((item) => item.label && (item.link || item.children.length > 0)) : [];
  return (
    <footer className={shell}>
      <div className="mx-auto max-w-[var(--ws-max)] px-5 py-12 @2xl:px-8 @2xl:py-16">
        <div className="flex flex-wrap gap-x-14 gap-y-10">
          <div className="min-w-0 max-w-sm basis-full @3xl:basis-72 @3xl:grow-[2]">
            <SiteLink ctx={ctx} link={home} className="flex min-w-0 flex-wrap items-center gap-3">
              <Img src={logoUrl} alt="" className="h-9 w-auto max-w-[9rem] object-contain" />
              <span className="ws-h min-w-0 text-xl">{name}</span>
            </SiteLink>
            {footer.about && <p className="ws-muted mt-4 text-sm leading-relaxed whitespace-pre-line">{footer.about}</p>}
            {social && <SocialLinks ctx={ctx} className="mt-4 -ml-2" />}
          </div>
          {columns.map((column) => (
            <nav key={column.id} aria-label={column.title || 'Enlaces'} className="min-w-[10rem] grow">
              {column.title && <h2 className="ws-h mb-4 text-sm tracking-wider uppercase">{column.title}</h2>}
              <ul className="space-y-2.5 text-sm">
                {column.links.map(({ entry, link }) => (
                  <li key={entry.id}>
                    <SiteLink ctx={ctx} link={link} newTab={entry.newTab} className="ws-muted underline-offset-4 hover:underline">
                      {entry.label}
                    </SiteLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          {menu.length > 0 && (
            <nav aria-label="Menú del sitio" className="min-w-[10rem] grow">
              <h2 className="ws-h mb-4 text-sm tracking-wider uppercase">Menú</h2>
              <ul className="space-y-2.5 text-sm">
                {menu.map((item) => (
                  <li key={item.key}>
                    {item.link ? (
                      <SiteLink ctx={ctx} link={item.link} newTab={item.newTab} className="ws-muted underline-offset-4 hover:underline">
                        {item.label}
                      </SiteLink>
                    ) : (
                      <span className="ws-muted">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <p className="ws-muted mt-12 border-t border-[color:var(--s-line)] pt-6 text-sm">{legend}</p>
        {footer.layout === 'big' && (
          <p aria-hidden="true" className="ws-h mt-10 leading-[0.9] tracking-tight" style={{ fontSize: `clamp(1.5rem, ${Math.round(130 / Math.max(6, Math.min(40, name.length)))}cqi, 12rem)` }}>
            {name}
          </p>
        )}
      </div>
    </footer>
  );
}

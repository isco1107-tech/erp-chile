import { pageLink, homeOf } from '@/lib/web-sites/site';
import { resolveIn, type RenderCtx } from './context';
import { hasSocial, SocialLinks } from './SiteHeader';
import { cx, Img } from './parts';
import SiteLink from './SiteLink';
import type { NavItem } from './nav';
import type { Tone } from './tone';

const FOOTER_TONE: Record<'light' | 'muted' | 'dark' | 'primary', Tone> = { light: 'default', muted: 'muted', dark: 'dark', primary: 'primary' };

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
  const columns = footer.columns.map((column) => ({ ...column, links: column.links.flatMap((entry) => { const link = resolveIn(ctx, entry.href); return entry.label && link ? [{ entry, link }] : []; }) })).filter((column) => column.links.length > 0);
  const menu = footer.showMenu ? items.filter((item) => item.label && (item.link || item.children.length > 0)) : [];
  return (
    <footer className={shell}>
      <div className="mx-auto max-w-[var(--ws-max)] px-5 py-12 @2xl:px-8 @2xl:py-16">
        <div className="flex flex-wrap gap-x-14 gap-y-10">
          <div className="max-w-sm basis-full @3xl:basis-72 @3xl:grow-[2]">
            <SiteLink ctx={ctx} link={home} className="flex items-center gap-3">
              <Img src={logoUrl} alt="" className="h-9 w-auto max-w-[9rem] object-contain" />
              <span className="ws-h text-xl">{name}</span>
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
      </div>
    </footer>
  );
}

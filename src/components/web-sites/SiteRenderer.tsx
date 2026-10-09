import type { CSSProperties } from 'react';
import { isBlockEmpty, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { documentFromBlocks, findPage, homeOf, pageBlockAnchors, publishedPages, type SiteDocument } from '@/lib/web-sites/site';
import { themeVariables, type WebSiteTheme } from '@/lib/web-sites/theme';
import { SITE_FONT_CLASSES } from './site-fonts';
import type { RenderCtx } from './site/context';
import { MobileActionBar, WhatsappFloat } from './site/FloatingActions';
import { buildNavItems } from './site/nav';
import { cx } from './site/parts';
import SectionFrame, { EmptyBlock } from './site/SectionFrame';
import { renderSection } from './site/sections';
import SiteFooter, { footerTone } from './site/SiteFooter';
import SiteHeader, { Announcement } from './site/SiteHeader';
import { SITE_CSS } from './site/site-css';
import { blockHeadingText, resolveAlign, sectionLook, toneVariables, type Tone } from './site/tone';

/**
 * Pinta un sitio armado en modo guiado: encabezado con menú, las secciones de
 * una página, pie, botón flotante de WhatsApp y barra de acciones del celular.
 * Lo usan la página pública y la vista previa del editor, así que lo que se ve
 * mientras se edita es lo que se publica.
 *
 * Seguridad: todo texto pasa como texto de React (escapado), todo enlace por
 * `resolveLink` y toda imagen por `safeImageSrc`; el CSS es una constante y el
 * tema llega como variables validadas. Un bloque nunca inyecta HTML ni
 * `javascript:`.
 *
 * Es responsivo por el ANCHO DEL CONTENEDOR (container queries), no por el de
 * la ventana: la vista "celular" del editor se ve como un celular real. El
 * componente raíz no usa hooks (sirve desde un Server Component); las piezas
 * interactivas (`Countdown`, `MobileMenu`, `ContactForm`) son componentes de
 * cliente aparte.
 */

export interface SiteRendererProps {
  name: string;
  /** Secciones integradas en academia o certamen, sin otro encabezado, pie ni main. */
  embedded?: boolean;
  logoUrl: string | null;
  theme: WebSiteTheme;
  /** Sitio completo. */
  document?: SiteDocument;
  /** Compatibilidad: sin `document`, un sitio de una página hecho con estas secciones. */
  blocks?: WebSiteBlock[];
  /** Página a pintar; por omisión la de inicio. */
  pageId?: string;
  slug: string;
  mode: 'public' | 'preview';
  /** `/web/<slug>` (por omisión) o `''` en un dominio propio. */
  basePath?: string;
  /** Solo vista previa: un enlace a otra página del sitio. */
  onNavigate?: (pageId: string, anchor: string | null) => void;
  /** Solo vista previa: clic en una sección para editarla. */
  onSelectBlock?: (blockId: string) => void;
  /** Solo vista previa: sección resaltada. */
  selectedBlockId?: string | null;
}

export default function SiteRenderer({ embedded = false, name, logoUrl, theme, document, blocks, pageId, slug, mode, basePath, onNavigate, onSelectBlock, selectedBlockId }: SiteRendererProps) {
  const preview = mode === 'preview';
  const source = document ?? documentFromBlocks(blocks ?? [], theme);
  const doc = embedded ? { ...source, header: { ...source.header, enabled: false }, footer: { ...source.footer, enabled: false } } : source;
  const requested = pageId ? (preview ? findPage(doc, pageId) : publishedPages(doc).find((entry) => entry.id === pageId)) : null;
  const page = requested ?? homeOf(doc);
  const selectable = preview && Boolean(onSelectBlock);

  // Se pintan las secciones visibles con contenido; en la vista previa, las vacías salen como marcador para poder elegirlas.
  const shown = page.blocks.filter((block) => !block.hidden && (preview || !isBlockEmpty(block)));
  const anchors = pageBlockAnchors(page);
  const renderedAnchors = new Set(shown.flatMap((block) => (anchors.get(block.id) ? [anchors.get(block.id) as string] : [])));

  const ctx: RenderCtx = {
    doc,
    page,
    basePath: basePath ?? `/web/${slug}`,
    slug,
    preview,
    idPrefix: preview ? 'wsp-' : '',
    onNavigate,
    navigate: true,
    h1BlockId: embedded ? null : shown.find((block) => blockHeadingText(block))?.id ?? null,
    siteWidth: theme.width,
  };
  const bodyCtx: RenderCtx = selectable ? { ...ctx, navigate: false } : ctx;

  const first = shown[0];
  const firstEmpty = first ? isBlockEmpty(first) : false;
  const overlayTone = first && first.type === 'hero' && !firstEmpty ? sectionLook(first).tone : null;
  const overlay = doc.header.enabled && doc.header.style === 'transparent' && overlayTone !== null;
  const items = doc.header.enabled || doc.footer.enabled ? buildNavItems(ctx, renderedAnchors) : [];

  const rootStyle = { ...themeVariables(theme), ...toneVariables(theme) } as CSSProperties;
  const mainId = `${ctx.idPrefix}${embedded ? "creative-main" : "main"}`;
  const MainTag = embedded ? "div" : "main";
  const looks = shown.map((block) => sectionLook(block));
  // Lo que viene después de cada sección (para pintar su borde con forma): la siguiente o el pie.
  const afterLast: Tone = doc.footer.enabled ? footerTone(doc.footer.style) : 'default';
  const nextTones: Tone[] = shown.map((_, index) => {
    const next = looks[index + 1];
    if (!next) return afterLast;
    return next.image ? 'dark' : next.tone;
  });

  return (
    <div className={cx('ws-root', SITE_FONT_CLASSES)} style={rootStyle} data-ws-root="" data-btn={theme.buttonStyle} data-card={theme.cardStyle} data-anim={preview ? 'none' : theme.animation}>
      <style>{SITE_CSS}</style>
      <div className={cx('@container flex flex-col', !preview && !embedded && 'min-h-dvh')}>
        {!preview && !embedded && (
          <a href={`#${mainId}`} className="ws-skip">
            Saltar al contenido
          </a>
        )}
        {doc.header.enabled && <Announcement ctx={ctx} />}
        {doc.header.enabled && <SiteHeader ctx={ctx} name={name} logoUrl={logoUrl} items={items} overlayTone={overlayTone} />}
        <MainTag id={mainId} tabIndex={-1} className="grow outline-none">
          {shown.map((block, index) => {
            const look = looks[index]!;
            const empty = isBlockEmpty(block);
            return (
              <SectionFrame
                key={block.id}
                ctx={bodyCtx}
                block={block}
                anchor={anchors.get(block.id) ?? block.id}
                look={look}
                align={resolveAlign(block)}
                bleed={block.type === 'image' && block.size === 'full'}
                glow={block.type === 'hero' && (block.variant === 'center' || block.variant === 'full' || block.variant === 'card')}
                underHeader={overlay && index === 0}
                nextTone={nextTones[index]}
                onSelect={selectable ? onSelectBlock : undefined}
                selected={selectable && selectedBlockId === block.id}
              >
                {empty ? <EmptyBlock block={block} /> : renderSection(block, bodyCtx, resolveAlign(block) === 'center', look)}
              </SectionFrame>
            );
          })}
        </MainTag>
        <SiteFooter ctx={ctx} name={name} logoUrl={logoUrl} items={items} />
        {!embedded && <MobileActionBar ctx={ctx} />}
        {!embedded && <WhatsappFloat ctx={ctx} />}
      </div>
    </div>
  );
}

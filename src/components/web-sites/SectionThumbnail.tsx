'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { WebSiteBlock } from '@/lib/web-sites/blocks';
import { documentFromBlocks, type SiteDocument } from '@/lib/web-sites/site';
import { themeVariables, type WebSiteTheme } from '@/lib/web-sites/theme';
import { SITE_FONT_CLASSES } from './site-fonts';
import type { RenderCtx } from './site/context';
import { cx } from './site/parts';
import SectionFrame from './site/SectionFrame';
import { renderSection } from './site/sections';
import { SITE_CSS } from './site/site-css';
import { resolveAlign, sectionLook, toneVariables } from './site/tone';

/** Ancho al que se dibuja la sección antes de achicarla: el de un notebook (sobre 64 rem, para ver el diseño de escritorio completo). */
const STAGE_WIDTH = 1080;

/** Estilos del renderizador; va una vez en cada lista de miniaturas. */
export function ThumbnailStyles() {
  return <style>{SITE_CSS}</style>;
}

interface SectionThumbnailProps {
  block: WebSiteBlock;
  theme: WebSiteTheme;
  /** Sitio real (número de WhatsApp, redes); sin él, uno vacío. */
  document?: SiteDocument | null;
  /** Alto visible de la miniatura, en px del tamaño final. */
  height?: number;
  className?: string;
}

/**
 * Miniatura real de una sección: la misma sección del sitio (mismos
 * componentes y el tema del usuario) dibujada a 1200 px de ancho y achicada a
 * lo que mida la tarjeta. Es solo un dibujo: `inert` y `aria-hidden` (el texto
 * de la opción es lo que se lee), sin animaciones y con marcadores donde el
 * diseño lleva fotos que aún no hay.
 */
function SectionThumbnailInner({ block, theme, document, height = 150, className }: SectionThumbnailProps) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth > 0 ? el.clientWidth / STAGE_WIDTH : 0.25);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const doc = document ?? documentFromBlocks([block]);
  const page = doc.pages[0]!;
  const ctx: RenderCtx = { doc, page, basePath: '/web/vista', slug: 'vista', preview: true, idPrefix: `wst-${block.id}-`, navigate: false, h1BlockId: null, placeholders: true };
  const look = sectionLook(block);
  const align = resolveAlign(block);
  const rootStyle = { ...themeVariables(theme), ...toneVariables(theme), width: STAGE_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' } as CSSProperties;

  return (
    <div ref={box} aria-hidden="true" inert className={cx('relative w-full overflow-hidden rounded-md border border-border bg-background', className)} style={{ height }}>
      <div className={cx('ws-root pointer-events-none absolute top-0 left-0', SITE_FONT_CLASSES)} style={rootStyle} data-btn={theme.buttonStyle} data-card={theme.cardStyle} data-anim="none" data-still="">
        <div className="@container">
          <SectionFrame ctx={ctx} block={block} anchor={`${block.id}-${block.variant}`} look={look} align={align} bleed={block.type === 'image' && block.size === 'full'} glow={block.type === 'hero' && (block.variant === 'center' || block.variant === 'full' || block.variant === 'card')} nextTone="default">
            {renderSection(block, ctx, align === 'center', look)}
          </SectionFrame>
        </div>
      </div>
    </div>
  );
}

export const SectionThumbnail = memo(SectionThumbnailInner);

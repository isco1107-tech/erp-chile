import { Fragment, type CSSProperties } from 'react';
import { canvasElementStyle, canvasPosition, canvasFontSize, type CanvasElement, type SiteCanvas } from '@/lib/web-sites/canvas';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from './context';
import SiteLink from './SiteLink';

export function CanvasText({ element }: { element: Pick<CanvasElement, 'text' | 'richText'> }) {
  if (!element.richText) return element.text;
  return element.richText.map(({ text, bold, italic, underline }, index) => (
    <span key={index} style={{ fontWeight: bold ? 900 : undefined, fontStyle: italic ? 'italic' : undefined, textDecoration: underline ? 'underline' : undefined }}>{text}</span>
  ));
}

export function CanvasContent({ element, defaultImageFit = 'cover' }: { element: CanvasElement; defaultImageFit?: 'cover' | 'contain' }) {
  if (element.kind === 'image') {
    const src = safeImageSrc(element.imageUrl);
    const { fit = defaultImageFit, x = 50, y = 50, zoom = 100 } = element.imageFrame ?? {};
    // eslint-disable-next-line @next/next/no-img-element
    return src ? <img draggable={false} src={src} alt={element.alt} loading="lazy" className="h-full w-full"
      style={{ borderRadius: 'inherit', objectFit: fit, objectPosition: `${x}% ${y}%`, transformOrigin: `${x}% ${y}%`, scale: zoom === 100 ? undefined : zoom / 100 }} /> : null;
  }
  if (element.kind === 'shape') return null;
  return <span className="block w-full whitespace-pre-wrap break-words"><CanvasText element={element} /></span>;
}

export default function CanvasScene({ canvas, ctx, blockId, responsiveImageIds }: {
  canvas: SiteCanvas; ctx: RenderCtx; blockId: string; responsiveImageIds?: ReadonlySet<string>;
}) {
  if (!canvas.enabled) return null;
  const sceneStyle = { '--canvas-height': `${canvas.height}px`, '--canvas-mobile-height': `${canvas.mobileHeight}px` } as CSSProperties;
  const layers = [];
  const images = [];
  for (const [index, element] of canvas.elements.entries()) {
    if (element.hidden) continue;
    const responsiveImage = responsiveImageIds?.has(element.id);
    const style: CSSProperties & Record<string, string | number | undefined> = { ...canvasElementStyle(element), zIndex: index + 1 };
    for (const device of ['desktop', 'tablet', 'mobile'] as const) {
      const p = canvasPosition(element, device);
      for (const key of ['x', 'y', 'width', 'height'] as const) style[`--${device}-${key}`] = `${p[key]}%`;
    }
    style['--canvas-font'] = `${element.fontSize / 12}cqw`;
    style['--tablet-font'] = `${canvasFontSize(element, 'tablet') / 7.68}cqw`;
    style['--mobile-font'] = `${canvasFontSize(element, 'mobile') / 3.9}cqw`;
    style['--canvas-duration'] = `${element.duration}ms`;
    style['--canvas-delay'] = `${element.delay}ms`;
    const content = <CanvasContent element={element} defaultImageFit={responsiveImage ? 'contain' : 'cover'} />;
    const link = ctx.renderCanvasLayer || element.kind === 'shape' ? null : resolveIn(ctx, element.href);
    // `data-kind`: un texto nunca se recorta si mide un poco más que su caja (en celular pasaba); botones e imágenes sí, por sus esquinas.
    const node = ctx.renderCanvasLayer ? (
      <Fragment key={element.id}>{ctx.renderCanvasLayer(blockId, element, style, content)}</Fragment>
    ) : (
      <div key={element.id} className="ws-canvas-element" data-pageant-layer={element.id} data-kind={element.kind} data-mobile-hidden={element.mobileHidden || undefined}
        role={element.headingLevel ? 'heading' : undefined} aria-level={element.headingLevel} style={style}>
        <div className="ws-canvas-motion" data-motion={ctx.preview ? 'none' : element.motion}>
          {link ? <SiteLink ctx={ctx} link={link} className="ws-canvas-link">{content}</SiteLink> : content}
        </div>
      </div>
    );
    if (responsiveImage) {
      images.push(<div key={element.id} className="ws-canvas-image-slot"
        data-auto-tablet={!element.tablet || undefined} data-auto-mobile={(!element.mobile && !element.mobileHidden) || undefined}>{node}</div>);
    } else {
      layers.push(node);
    }
  }
  return (
    <div className="ws-canvas" style={sceneStyle}>
      {layers}
      {images.length > 0 && <div className="ws-canvas-image-row">{images}</div>}
    </div>
  );
}

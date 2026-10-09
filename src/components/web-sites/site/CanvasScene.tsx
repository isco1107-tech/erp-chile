import type { CSSProperties } from 'react';
import { canvasElementStyle, canvasPosition, canvasFontSize, type CanvasElement, type SiteCanvas } from '@/lib/web-sites/canvas';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from './context';
import SiteLink from './SiteLink';

export function CanvasContent({ element }: { element: CanvasElement }) {
  if (element.kind === 'image') {
    const src = safeImageSrc(element.imageUrl);
    // eslint-disable-next-line @next/next/no-img-element
    return src ? <img draggable={false} src={src} alt={element.alt} loading="lazy" className="h-full w-full object-cover" style={{ borderRadius: 'inherit' }} /> : null;
  }
  if (element.kind === 'shape') return null;
  return <span className="block w-full whitespace-pre-wrap break-words">{element.text}</span>;
}

export default function CanvasScene({ canvas, ctx }: { canvas: SiteCanvas; ctx: RenderCtx }) {
  if (!canvas.enabled) return null;
  const sceneStyle = { '--canvas-height': `${canvas.height}px`, '--canvas-mobile-height': `${canvas.mobileHeight}px` } as CSSProperties;
  return (
    <div className="ws-canvas" style={sceneStyle}>
      {canvas.elements.filter((el) => !el.hidden).map((element, index) => {
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
        const content = <CanvasContent element={element} />;
        const link = element.kind === 'shape' ? null : resolveIn(ctx, element.href);
        // `data-kind`: un texto nunca se recorta si mide un poco más que su caja (en celular pasaba); botones e imágenes sí, por sus esquinas.
        return (
          <div key={element.id} className="ws-canvas-element" data-kind={element.kind} data-mobile-hidden={element.mobileHidden || undefined} style={style}>
            <div className="ws-canvas-motion" data-motion={ctx.preview ? 'none' : element.motion}>
              {link ? <SiteLink ctx={ctx} link={link} className="ws-canvas-link">{content}</SiteLink> : content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

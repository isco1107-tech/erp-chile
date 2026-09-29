import type { ReactNode } from 'react';
import { BLOCK_INFO, type WebSiteBlock } from '@/lib/web-sites/blocks';
import type { RenderCtx } from './context';
import { cx, Img } from './parts';
import { spacingClass, type Alignment, type SectionLook } from './tone';

interface FrameProps {
  ctx: RenderCtx;
  block: WebSiteBlock;
  anchor: string;
  look: SectionLook;
  align: Alignment;
  /** Contenido a ancho completo, sin el margen lateral (imagen "a todo el ancho"). */
  bleed?: boolean;
  /** Resplandor suave detrás del texto de una portada de color. */
  glow?: boolean;
  /** Va justo bajo un encabezado transparente: deja espacio para que no tape el contenido. */
  underHeader?: boolean;
  /** Vista previa con edición por clic. */
  onSelect?: (blockId: string) => void;
  selected?: boolean;
  children: ReactNode;
}

/**
 * Franja de una sección: fondo (color del tema o foto con velo), espaciado,
 * alineación y, en la vista previa del editor, el contorno "Editar «…»" que
 * selecciona la sección. El título de la etiqueta es el nombre del tipo de
 * sección. Un clic en cualquier parte de la franja la selecciona; para el
 * teclado, la etiqueta es un botón real al que se llega con Tab.
 */
export default function SectionFrame({ ctx, block, anchor, look, align, bleed = false, glow = false, underHeader = false, onSelect, selected = false, children }: FrameProps) {
  const label = BLOCK_INFO[block.type].label;
  return (
    <section
      id={`${ctx.idPrefix}${anchor}`}
      data-block-id={block.id}
      data-ws-type={block.type}
      className={cx('ws-section ws-bg', `ws-tone-${look.tone}`, spacingClass(block), underHeader && 'ws-under-header', onSelect && 'group/sec isolate cursor-pointer')}
      onClick={onSelect ? () => onSelect(block.id) : undefined}
    >
      {look.image && (
        <>
          <Img src={look.image} alt="" className="absolute inset-0 h-full w-full object-cover" eager />
          <div aria-hidden="true" className="ws-scrim absolute inset-0" style={{ opacity: look.overlay / 100 }} />
        </>
      )}
      {glow && !look.image && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,color-mix(in_srgb,var(--ws-accent)_38%,transparent),transparent_70%)] opacity-70" />
      )}
      <div className={cx('ws-reveal relative mx-auto w-full', bleed ? 'px-0' : 'max-w-[var(--ws-max)] px-5 @2xl:px-8', align === 'center' && 'text-center')}>{children}</div>
      {onSelect && (
        <>
          <span
            aria-hidden="true"
            className={cx(
              'pointer-events-none absolute inset-0 z-20 opacity-0 ring-2 ring-inset ring-ring transition-opacity group-hover/sec:opacity-100',
              selected && 'opacity-100 ring-4'
            )}
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(block.id);
            }}
            className={cx(
              'absolute top-2 left-2 z-30 rounded-md bg-primary px-2.5 py-1 text-left text-xs font-semibold text-primary-foreground opacity-0 shadow-md outline-none transition-opacity group-hover/sec:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring',
              selected && 'opacity-100'
            )}
          >
            Editar «{label}»
          </button>
        </>
      )}
    </section>
  );
}

/** Marcador de una sección sin contenido: solo se ve en la vista previa (al publicar se omite). */
export function EmptyBlock({ block }: { block: WebSiteBlock }) {
  return (
    <div className="ws-muted rounded-[var(--ws-radius)] border-2 border-dashed border-[color:var(--s-line)] px-6 py-10 text-center">
      <p className="font-semibold">{BLOCK_INFO[block.type].label}</p>
      <p className="mt-1 text-sm">Esta sección está vacía. Completa sus campos para que aparezca en el sitio publicado.</p>
    </div>
  );
}

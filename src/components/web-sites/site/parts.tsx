import { Fragment, type ReactNode } from 'react';
import { ImageIcon } from 'lucide-react';
import { parseRichText, type RichInline } from '@/lib/web-sites/rich-text';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from './context';
import SiteLink from './SiteLink';

/** Piezas pequeñas que comparten las secciones. Todo texto pasa como texto de React (escapado). */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Imagen remota del almacenamiento del cliente: solo https, sin `next/image`. */
export function Img({ src, alt, className, eager = false }: { src: string | null | undefined; alt: string; className?: string; eager?: boolean }) {
  const safe = safeImageSrc(src);
  if (!safe) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={safe} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className={className} />;
}

/** ¿Hay foto para pintar? En las miniaturas de diseños, un marcador cuenta como foto. */
export function hasPhoto(ctx: RenderCtx, src: string | null | undefined): boolean {
  return Boolean(safeImageSrc(src)) || Boolean(ctx.placeholders);
}

/** Foto de una sección; en las miniaturas de diseños, sin foto se dibuja un marcador del mismo tamaño. */
export function Photo({ ctx, src, alt, className, eager = false }: { ctx: RenderCtx; src: string | null | undefined; alt: string; className?: string; eager?: boolean }) {
  if (safeImageSrc(src)) return <Img src={src} alt={alt} className={className} eager={eager} />;
  if (!ctx.placeholders) return null;
  return (
    <span aria-hidden="true" className={cx('ws-ph', className)}>
      <ImageIcon className="size-7" />
    </span>
  );
}

/** Estrellas de una calificación: ★ decorativas con una sola etiqueta para lectores de pantalla ("4 de 5"). */
export function Stars({ rating }: { rating: number }) {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  if (value === 0) return null;
  return (
    <span role="img" aria-label={`${value} de 5`} className="inline-flex gap-0.5 text-lg leading-none">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden="true" className={n <= value ? 'ws-star' : 'ws-star-off'}>
          ★
        </span>
      ))}
    </span>
  );
}

function Inline({ ctx, nodes }: { ctx: RenderCtx; nodes: RichInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case 'text':
            return <Fragment key={index}>{node.text}</Fragment>;
          case 'strong':
            return (
              <strong key={index} className="font-bold">
                <Inline ctx={ctx} nodes={node.children} />
              </strong>
            );
          case 'em':
            return (
              <em key={index}>
                <Inline ctx={ctx} nodes={node.children} />
              </em>
            );
          case 'link': {
            // El enlace pasa por la misma barrera que los botones: `[x](javascript:…)` queda como texto.
            const link = resolveIn(ctx, node.href);
            if (!link) return <Inline key={index} ctx={ctx} nodes={node.children} />;
            return (
              <SiteLink key={index} ctx={ctx} link={link} className="font-medium underline decoration-1 underline-offset-[0.2em] [color:var(--s-mark)]">
                <Inline ctx={ctx} nodes={node.children} />
              </SiteLink>
            );
          }
        }
      })}
    </>
  );
}

function Lines({ ctx, lines }: { ctx: RenderCtx; lines: RichInline[][] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          <Inline ctx={ctx} nodes={line} />
        </Fragment>
      ))}
    </>
  );
}

/** Texto con formato simple (negrita, cursiva, enlaces, listas y subtítulos) como elementos de React. */
export function RichText({ ctx, text, className }: { ctx: RenderCtx; text: string; className?: string }) {
  const blocks = parseRichText(text);
  if (blocks.length === 0) return null;
  return (
    <div className={cx('space-y-4 text-[1.0625rem] leading-relaxed break-words', className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'p':
            return (
              <p key={index}>
                <Lines ctx={ctx} lines={block.lines} />
              </p>
            );
          case 'h3':
            return (
              <h3 key={index} className="ws-h pt-2 text-xl @2xl:text-2xl">
                <Inline ctx={ctx} nodes={block.content} />
              </h3>
            );
          case 'ul':
            return (
              <ul key={index} className="list-disc space-y-1.5 pl-6 marker:[color:var(--s-mark)]">
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inline ctx={ctx} nodes={item} />
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={index} className="list-decimal space-y-1.5 pl-6 marker:font-semibold marker:[color:var(--s-mark)]">
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inline ctx={ctx} nodes={item} />
                  </li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}

interface HeadingProps {
  ctx: RenderCtx;
  blockId: string;
  center: boolean;
  eyebrow?: string;
  title?: string;
  intro?: string;
  /** Tamaño del título: las secciones de contenido usan `md`; una frase destacada, `lg`. */
  size?: 'md' | 'lg';
  className?: string;
}

/** Encabezado de sección: sobretítulo, título (h1 si es el principal de la página, si no h2) y bajada. */
export function SectionHeading({ ctx, blockId, center, eyebrow, title, intro, size = 'md', className }: HeadingProps) {
  if (!eyebrow && !title && !intro) return null;
  const Tag = ctx.h1BlockId === blockId ? 'h1' : 'h2';
  return (
    <header className={cx('mb-10 max-w-2xl @2xl:mb-12', center && 'mx-auto text-center', className)}>
      {eyebrow && <p className="ws-eyebrow mb-3">{eyebrow}</p>}
      {title && (
        <Fit>
          <Tag className={cx('ws-h', size === 'lg' ? 'ws-t-lg' : 'ws-t-2')}>{title}</Tag>
        </Fit>
      )}
      {intro && <p className="ws-muted mt-4 text-lg leading-relaxed">{intro}</p>}
    </header>
  );
}

/**
 * Medida de los títulos grandes: el tamaño (`ws-t-*`, en `cqi`) se calcula con
 * el ancho real de la columna donde está el título, no con el de la pantalla.
 * Así una palabra larga ("Remodelaciones") cabe tanto en una portada a lo ancho
 * como en la mitad de una portada dividida o en una tarjeta angosta.
 */
export function Fit({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('ws-fit', className)}>{children}</div>;
}

/** Título de una sección sin el envoltorio (para diseños que lo ubican en otra parte). */
export function HeadingTag({ ctx, blockId, className, children }: { ctx: RenderCtx; blockId: string; className?: string; children: ReactNode }) {
  const Tag = ctx.h1BlockId === blockId ? 'h1' : 'h2';
  return (
    <Fit>
      <Tag className={cx('ws-h', className)}>{children}</Tag>
    </Fit>
  );
}

/** Renglón con ícono que se repite en listas de beneficios, contacto y precios. */
export function CheckRow({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <span className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 [color:var(--s-mark)]">{icon}</span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

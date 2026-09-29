import { ExternalLink } from 'lucide-react';
import { Fragment } from 'react';
import { mapEmbedUrl, mapLinkUrl, safeImageSrc, videoEmbed } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from '../context';
import { cx, Img, SectionHeading } from '../parts';
import SiteLink from '../SiteLink';
import type { SectionProps } from './shared';

const COLS = {
  grid: { '2': '@2xl:grid-cols-2', '3': '@2xl:grid-cols-3', '4': '@2xl:grid-cols-4' },
  masonry: { '2': '@2xl:columns-2', '3': '@2xl:columns-3', '4': '@2xl:columns-4' },
  carousel: {
    '2': '@2xl:basis-[calc((100%-1rem)/2)]',
    '3': '@2xl:basis-[calc((100%-2rem)/3)]',
    '4': '@2xl:basis-[calc((100%-3rem)/4)]',
  },
} as const;

export function GallerySection({ block, ctx, center }: SectionProps<'gallery'>) {
  const images = block.images.filter((image) => safeImageSrc(image.url));
  const cols = block.columns;
  const figure = (image: (typeof images)[number], className: string, imgClass: string) => (
    <figure className={className}>
      <Img src={image.url} alt={image.alt} className={cx('w-full rounded-[var(--ws-radius)] object-cover', imgClass)} />
      {image.caption && <figcaption className="ws-muted mt-2 text-sm">{image.caption}</figcaption>}
    </figure>
  );
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} />
      {block.variant === 'carousel' ? (
        // Región con desplazamiento: enfocable para que el teclado pueda recorrerla.
        <div role="region" aria-label={block.heading || 'Galería de imágenes'} tabIndex={0} className="ws-carousel -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 @2xl:mx-0 @2xl:px-0">
          {images.map((image, index) => (
            <Fragment key={index}>{figure(image, cx('shrink-0 basis-[82%] snap-center text-left', COLS.carousel[cols]), 'aspect-[4/3]')}</Fragment>
          ))}
        </div>
      ) : block.variant === 'masonry' ? (
        <ul className={cx('columns-2 gap-3 @2xl:gap-4', COLS.masonry[cols])}>
          {images.map((image, index) => (
            <li key={index} className="mb-3 break-inside-avoid text-left @2xl:mb-4">
              {figure(image, '', 'h-auto')}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={cx('grid grid-cols-2 gap-3 @2xl:gap-4', COLS.grid[cols])}>
          {images.map((image, index) => (
            <li key={index} className="text-left">
              {figure(image, '', 'aspect-square @2xl:aspect-[4/3]')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ventana de un servicio externo (video o mapa). El contenido del iframe corre en el origen del servicio, nunca en el nuestro. */
function ExternalFrame({ ctx, src, title, sandbox, allow, className }: { ctx: RenderCtx; src: string; title: string; sandbox: string; allow?: string; className: string }) {
  return (
    <div className={cx('relative overflow-hidden rounded-[calc(var(--ws-radius)*1.2)] bg-black/5 shadow-xl', className)}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow={allow}
        allowFullScreen={allow?.includes('fullscreen')}
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox={sandbox}
        // En la vista previa el clic tiene que llegar a la sección para poder seleccionarla.
        className={cx('absolute inset-0 h-full w-full border-0', ctx.preview && 'pointer-events-none')}
      />
    </div>
  );
}

export function VideoSection({ block, ctx, center }: SectionProps<'video'>) {
  const embed = videoEmbed(block.url);
  if (!embed) return null;
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <ExternalFrame
        ctx={ctx}
        src={embed.embedUrl}
        title={block.heading || 'Video'}
        allow="fullscreen; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        className="aspect-video"
      />
      {block.caption && <p className="ws-muted mt-3 text-center text-sm">{block.caption}</p>}
    </div>
  );
}

const MAP_HEIGHT = { sm: 'h-56', md: 'h-72 @2xl:h-96', lg: 'h-96 @2xl:h-[32rem]' } as const;

export function MapView({ ctx, address, height }: { ctx: RenderCtx; address: string; height: keyof typeof MAP_HEIGHT }) {
  const src = mapEmbedUrl(address);
  if (!src) return null;
  const open = resolveIn(ctx, mapLinkUrl(address));
  return (
    <div>
      <ExternalFrame ctx={ctx} src={src} title={`Mapa: ${address}`} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" className={MAP_HEIGHT[height]} />
      {open && (
        <SiteLink ctx={ctx} link={open} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-4 [color:var(--s-mark)]">
          Abrir en Google Maps <ExternalLink className="size-4" aria-hidden="true" />
        </SiteLink>
      )}
    </div>
  );
}

export function MapSection({ block, ctx, center }: SectionProps<'map'>) {
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.text} />
      <div className="text-left">
        {block.address && <p className="mb-4 font-medium">{block.address}</p>}
        <MapView ctx={ctx} address={block.address} height={block.height} />
      </div>
    </div>
  );
}

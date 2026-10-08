import { ExternalLink, MapPin } from 'lucide-react';
import { embedFrom, mapEmbedUrl, mapLinkUrl, safeImageSrc, videoEmbed } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from '../context';
import BeforeAfter from '../BeforeAfter';
import Carousel from '../Carousel';
import { cx, hasPhoto, HeadingTag, Photo, RichText, SectionHeading } from '../parts';
import SiteLink from '../SiteLink';
import type { SectionProps } from './shared';

const COLS = {
  grid: { '2': '@2xl:grid-cols-2', '3': '@2xl:grid-cols-3', '4': '@2xl:grid-cols-4' },
  masonry: { '2': '@2xl:columns-2', '3': '@2xl:columns-3', '4': '@2xl:columns-4' },
  carousel: {
    '2': 'basis-[82%] @2xl:basis-[calc((100%-1rem)/2)]',
    '3': 'basis-[82%] @2xl:basis-[calc((100%-2rem)/3)]',
    '4': 'basis-[82%] @2xl:basis-[calc((100%-3rem)/4)]',
  },
} as const;

/** Tamaños del mosaico de la galería, en ciclo de seis. */
const BENTO = ['col-span-2 row-span-2', '', 'row-span-2', '', 'col-span-2', ''] as const;
const TILT = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2'] as const;

type GalleryImage = SectionProps<'gallery'>['block']['images'][number];

export function GallerySection({ block, ctx, center }: SectionProps<'gallery'>) {
  const images = block.images.filter((image) => hasPhoto(ctx, image.url));
  const cols = block.columns;
  const figure = (image: GalleryImage, className: string, imgClass: string) => (
    <figure className={className}>
      <Photo ctx={ctx} src={image.url} alt={image.alt} className={cx('w-full rounded-[var(--ws-radius)] object-cover', imgClass)} />
      {image.caption && <figcaption className="ws-muted mt-2 text-sm">{image.caption}</figcaption>}
    </figure>
  );
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} />;

  switch (block.variant) {
    case 'carousel':
      return (
        <div>
          {heading}
          <Carousel label={block.heading || 'Galería de imágenes'} itemClassName={COLS.carousel[cols]}>
            {images.map((image, index) => (
              <div key={index} className="text-left">
                {figure(image, '', 'aspect-[4/3]')}
              </div>
            ))}
          </Carousel>
        </div>
      );
    case 'strip':
      return (
        <div>
          {heading}
          <Carousel label={block.heading || 'Galería de imágenes'} itemClassName="basis-[62%] @2xl:basis-[calc((100%-2rem)/3)] @4xl:basis-[calc((100%-3rem)/4)]">
            {images.map((image, index) => (
              <div key={index} className="text-left">
                {figure(image, '', 'aspect-[3/4]')}
              </div>
            ))}
          </Carousel>
        </div>
      );
    case 'masonry':
      return (
        <div>
          {heading}
          <ul className={cx('columns-2 gap-3 @2xl:gap-4', COLS.masonry[cols])}>
            {images.map((image, index) => (
              <li key={index} className="mb-3 break-inside-avoid text-left @2xl:mb-4">
                {figure(image, '', cx('h-auto', ctx.placeholders && (index % 3 === 0 ? 'aspect-[3/4]' : index % 3 === 1 ? 'aspect-square' : 'aspect-[4/3]')))}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'featured':
      return (
        <div>
          {heading}
          <ul className="grid grid-cols-2 gap-3 @2xl:grid-cols-4 @2xl:gap-4">
            {images.map((image, index) => (
              <li key={index} className={cx('text-left', index === 0 && 'col-span-2 row-span-2')}>
                <Photo ctx={ctx} src={image.url} alt={image.alt} className="aspect-square h-full w-full rounded-[var(--ws-radius)] object-cover" />
              </li>
            ))}
          </ul>
        </div>
      );
    case 'bento':
      return (
        <div>
          {heading}
          <ul className="grid auto-rows-[9rem] grid-flow-dense grid-cols-2 gap-3 @2xl:auto-rows-[12rem] @2xl:grid-cols-4 @2xl:gap-4">
            {images.map((image, index) => (
              <li key={index} className={BENTO[index % BENTO.length]}>
                <Photo ctx={ctx} src={image.url} alt={image.alt} className="h-full w-full rounded-[var(--ws-radius)] object-cover" />
              </li>
            ))}
          </ul>
        </div>
      );
    case 'polaroid':
      return (
        <div>
          {heading}
          <ul className={cx('grid grid-cols-1 gap-8 px-2 @md:grid-cols-2 @2xl:gap-10', COLS.grid[cols])}>
            {images.map((image, index) => (
              <li key={index} className={cx('ws-polaroid mx-auto w-full max-w-sm', TILT[index % TILT.length])}>
                <Photo ctx={ctx} src={image.url} alt={image.alt} className="aspect-square w-full object-cover" />
                <p className="px-1 py-3 text-center text-sm">{image.caption || ' '}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'grid':
      return (
        <div>
          {heading}
          <ul className={cx('grid grid-cols-2 gap-3 @2xl:gap-4', COLS.grid[cols])}>
            {images.map((image, index) => (
              <li key={index} className="text-left">
                {figure(image, '', 'aspect-square @2xl:aspect-[4/3]')}
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

/** Ventana de un servicio externo (video, mapa, incrustación). El contenido del iframe corre en el origen del servicio, nunca en el nuestro. */
function ExternalFrame({ ctx, src, title, sandbox, allow, className, height }: { ctx: RenderCtx; src: string; title: string; sandbox: string; allow?: string; className: string; height?: number }) {
  if (ctx.placeholders) {
    return <span aria-hidden="true" className={cx('ws-ph block rounded-[calc(var(--ws-radius)*1.2)]', className)} style={height ? { height } : undefined} />;
  }
  return (
    <div className={cx('relative overflow-hidden rounded-[calc(var(--ws-radius)*1.2)] bg-black/5 shadow-xl', className)} style={height ? { height } : undefined}>
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
  if (!embed && !ctx.placeholders) return null;
  const frame = (
    <ExternalFrame
      ctx={ctx}
      src={embed?.embedUrl ?? ''}
      title={block.heading || 'Video'}
      allow="fullscreen; picture-in-picture"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      className="aspect-video"
    />
  );
  const caption = block.caption ? <p className={cx('ws-muted mt-3 text-sm', block.variant !== 'split' && 'text-center')}>{block.caption}</p> : null;
  if (block.variant === 'split') {
    return (
      <div className="grid items-center gap-10 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] @3xl:gap-14">
        <div>
          {block.heading && (
            <HeadingTag ctx={ctx} blockId={block.id} className="ws-t-2">
              {block.heading}
            </HeadingTag>
          )}
          {block.intro && <p className="ws-muted mt-4 text-lg leading-relaxed">{block.intro}</p>}
        </div>
        <div>
          {frame}
          {caption}
        </div>
      </div>
    );
  }
  return (
    <div className={cx('mx-auto', block.variant === 'wide' ? 'max-w-none' : 'max-w-4xl')}>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      {frame}
      {caption}
    </div>
  );
}

const MAP_HEIGHT = { sm: 'h-56', md: 'h-72 @2xl:h-96', lg: 'h-96 @2xl:h-[32rem]' } as const;

export function MapView({ ctx, address, height }: { ctx: RenderCtx; address: string; height: keyof typeof MAP_HEIGHT }) {
  const src = mapEmbedUrl(address);
  if (!src && !ctx.placeholders) return null;
  const open = resolveIn(ctx, mapLinkUrl(address));
  return (
    <div>
      <ExternalFrame ctx={ctx} src={src ?? ''} title={`Mapa: ${address}`} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" className={MAP_HEIGHT[height]} />
      {open && (
        <SiteLink ctx={ctx} link={open} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-4 [color:var(--s-mark)]">
          Abrir en Google Maps <ExternalLink className="size-4" aria-hidden="true" />
        </SiteLink>
      )}
    </div>
  );
}

export function MapSection({ block, ctx, center }: SectionProps<'map'>) {
  if (block.variant === 'split') {
    const open = resolveIn(ctx, mapLinkUrl(block.address));
    return (
      <div className="grid gap-10 text-left @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] @3xl:items-center @3xl:gap-14">
        <div>
          {block.heading && (
            <HeadingTag ctx={ctx} blockId={block.id} className="ws-t-2">
              {block.heading}
            </HeadingTag>
          )}
          {block.text && <p className="ws-muted mt-4 text-lg leading-relaxed">{block.text}</p>}
          {block.address && (
            <p className="mt-6 flex items-start gap-3 text-lg font-medium">
              <span className="ws-icon-tile size-11 shrink-0">
                <MapPin className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 pt-2">{block.address}</span>
            </p>
          )}
          {open && (
            <SiteLink ctx={ctx} link={open} className="ws-btn ws-btn-main mt-8">
              Cómo llegar
            </SiteLink>
          )}
        </div>
        <ExternalFrame ctx={ctx} src={mapEmbedUrl(block.address) ?? ''} title={`Mapa: ${block.address}`} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" className={MAP_HEIGHT[block.height]} />
      </div>
    );
  }
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

// ---------------------------------------------------------------------------
// Incrustar
// ---------------------------------------------------------------------------

const EMBED_HEIGHT = { sm: 420, md: 620, lg: 780 } as const;

export function EmbedSection({ block, ctx, center }: SectionProps<'embed'>) {
  const embed = embedFrom(block.url);
  if (!embed && !ctx.placeholders) return null;
  const height = embed?.fixedHeight ?? EMBED_HEIGHT[block.height];
  const frame = (
    <div>
      <ExternalFrame ctx={ctx} src={embed?.src ?? ''} title={block.heading || embed?.label || 'Contenido incrustado'} sandbox={embed?.sandbox ?? ''} allow={embed?.allow} className="w-full" height={height} />
      {block.caption && <p className="ws-muted mt-3 text-sm">{block.caption}</p>}
    </div>
  );
  if (block.variant === 'split') {
    return (
      <div className="grid gap-10 text-left @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] @3xl:items-start @3xl:gap-14">
        <div>
          {block.heading && (
            <HeadingTag ctx={ctx} blockId={block.id} className="ws-t-2 mb-5">
              {block.heading}
            </HeadingTag>
          )}
          <RichText ctx={ctx} text={block.text} className="ws-muted" />
        </div>
        {frame}
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} />
      {block.text && <RichText ctx={ctx} text={block.text} className={cx('ws-muted mx-auto mb-8 max-w-2xl', center && 'text-center')} />}
      {frame}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Antes y después
// ---------------------------------------------------------------------------

export function BeforeAfterSection({ block, ctx, center }: SectionProps<'beforeafter'>) {
  const pairs = block.items.filter((pair) => (safeImageSrc(pair.beforeUrl) && safeImageSrc(pair.afterUrl)) || ctx.placeholders);
  const before = block.beforeLabel || 'Antes';
  const after = block.afterLabel || 'Después';
  const many = pairs.length > 1;
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <ul className={cx('grid gap-8', many ? '@3xl:grid-cols-2' : 'mx-auto max-w-4xl')}>
        {pairs.map((pair, index) => {
          const real = Boolean(safeImageSrc(pair.beforeUrl) && safeImageSrc(pair.afterUrl));
          return (
            <li key={index} className="text-left">
              {block.variant === 'slider' && real ? (
                <BeforeAfter before={pair.beforeUrl} after={pair.afterUrl} alt={pair.alt} beforeLabel={before} afterLabel={after} className="aspect-[4/3] rounded-[calc(var(--ws-radius)*1.2)] shadow-xl" />
              ) : (
                <div className="grid grid-cols-2 gap-2 @2xl:gap-3">
                  {[
                    { url: pair.beforeUrl, label: before },
                    { url: pair.afterUrl, label: after },
                  ].map((side) => (
                    <div key={side.label} className="relative">
                      <Photo ctx={ctx} src={side.url} alt={pair.alt ? `${side.label}: ${pair.alt}` : side.label} className="aspect-[3/4] w-full rounded-[var(--ws-radius)] object-cover" />
                      <span className="ws-ba-tag left-2">{side.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {pair.caption && <p className="ws-muted mt-3 text-sm">{pair.caption}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import type { ReactNode } from 'react';
import { cx, Fit, hasPhoto, Photo, RichText, SectionHeading, HeadingTag } from '../parts';
import type { SectionLook } from '../tone';
import { ActionButtons, type SectionProps } from './shared';

const ROUNDED = 'rounded-[calc(var(--ws-radius)*1.4)]';

// ---------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------

/** Fotos del collage: la principal y las extra, en ese orden. */
function heroPhotos(block: SectionProps<'hero'>['block']): { url: string; alt: string }[] {
  return [{ url: block.imageUrl, alt: '' }, ...block.images.map((image) => ({ url: image.url, alt: image.alt }))];
}

function Collage({ ctx, photos }: { ctx: SectionProps<'hero'>['ctx']; photos: { url: string; alt: string }[] }) {
  const shown = photos.filter((photo) => hasPhoto(ctx, photo.url)).slice(0, 4);
  if (shown.length === 0) return null;
  const photo = (index: number, className: string) => {
    const entry = shown[index];
    return entry ? <Photo ctx={ctx} src={entry.url} alt={entry.alt} eager={index === 0} className={cx('h-full w-full object-cover', ROUNDED, className)} /> : null;
  };
  if (shown.length === 1) return photo(0, 'aspect-[4/5] shadow-2xl');
  if (shown.length === 2) {
    return (
      <div className="grid grid-cols-2 gap-3 @2xl:gap-4">
        {photo(0, 'aspect-[3/4] shadow-xl')}
        <div className="pt-10">{photo(1, 'aspect-[3/4] shadow-xl')}</div>
      </div>
    );
  }
  if (shown.length === 3) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-3 @2xl:gap-4">
        <div className="row-span-2">{photo(0, 'shadow-xl')}</div>
        {photo(1, 'aspect-square shadow-lg')}
        {photo(2, 'aspect-square shadow-lg')}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 @2xl:gap-4">
      {photo(0, 'aspect-square shadow-lg')}
      <div className="translate-y-6">{photo(1, 'aspect-square shadow-lg')}</div>
      {photo(2, 'aspect-square shadow-lg')}
      <div className="translate-y-6">{photo(3, 'aspect-square shadow-lg')}</div>
    </div>
  );
}

export function HeroSection({ block, ctx, center }: SectionProps<'hero'> & { look: SectionLook }) {
  const Tag = ctx.h1BlockId === block.id ? 'h1' : 'h2';
  const variant = block.variant;
  const editorial = variant === 'editorial';
  const buttons = <ActionButtons ctx={ctx} center={center} primary={{ label: block.ctaLabel, href: block.ctaHref }} secondary={{ label: block.secondaryLabel, href: block.secondaryHref }} className="mt-10" />;
  const text = (
    <div className={cx('max-w-3xl', center && 'mx-auto')}>
      {block.eyebrow && <p className="ws-eyebrow mb-5">{block.eyebrow}</p>}
      {block.title && (
        <Fit>
          <Tag className="ws-h ws-t-hero">{block.title}</Tag>
        </Fit>
      )}
      {block.subtitle && <p className={cx('ws-muted mt-6 max-w-2xl text-lg leading-relaxed @2xl:text-xl', center && 'mx-auto')}>{block.subtitle}</p>}
      {buttons}
    </div>
  );

  switch (variant) {
    case 'split':
    case 'split-left': {
      const photo = hasPhoto(ctx, block.imageUrl);
      return (
        <div className={cx('grid items-center gap-10 @3xl:gap-14', photo && '@3xl:grid-cols-2')}>
          <div className={cx(variant === 'split-left' && photo && '@3xl:order-2')}>{text}</div>
          {photo && <Photo ctx={ctx} src={block.imageUrl} alt="" eager className={cx('aspect-[4/3] w-full object-cover shadow-2xl', ROUNDED)} />}
        </div>
      );
    }
    case 'minimal':
      return text;
    case 'card':
      return (
        <div className={cx('ws-tone-default ws-bg mx-auto max-w-2xl border border-[color:var(--s-line)] px-6 py-10 shadow-2xl @2xl:px-14 @2xl:py-14', ROUNDED, center && 'text-center')}>
          {block.eyebrow && <p className="ws-eyebrow mb-4">{block.eyebrow}</p>}
          {block.title && (
            <Fit>
              <Tag className="ws-h ws-t-lg">{block.title}</Tag>
            </Fit>
          )}
          {block.subtitle && <p className="ws-muted mt-5 text-lg leading-relaxed">{block.subtitle}</p>}
          <ActionButtons ctx={ctx} center={center} primary={{ label: block.ctaLabel, href: block.ctaHref }} secondary={{ label: block.secondaryLabel, href: block.secondaryHref }} className="mt-8" />
        </div>
      );
    case 'collage': {
      const photos = heroPhotos(block);
      const any = photos.some((photo) => hasPhoto(ctx, photo.url));
      return (
        <div className={cx('grid items-center gap-12 @3xl:gap-16', any && '@3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]')}>
          {text}
          {any && (
            <div className="pb-6">
              <Collage ctx={ctx} photos={photos} />
            </div>
          )}
        </div>
      );
    }
    case 'editorial':
      return (
        <div>
          {block.eyebrow && <p className="ws-eyebrow mb-6">{block.eyebrow}</p>}
          {block.title && (
            <Fit className={cx('max-w-6xl', center && 'mx-auto')}>
              <Tag className="ws-h ws-t-xl">{block.title}</Tag>
            </Fit>
          )}
          {(block.subtitle || block.ctaLabel || block.secondaryLabel) && (
            <div className={cx('mt-8 grid gap-6 border-t border-[color:var(--s-line)] pt-8 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @3xl:items-end', center && 'text-left')}>
              {block.subtitle ? <p className="ws-muted max-w-2xl text-lg leading-relaxed @2xl:text-xl">{block.subtitle}</p> : <span />}
              <ActionButtons ctx={ctx} center={false} primary={{ label: block.ctaLabel, href: block.ctaHref }} secondary={{ label: block.secondaryLabel, href: block.secondaryHref }} className="!mt-0 @3xl:justify-end" />
            </div>
          )}
          {hasPhoto(ctx, block.imageUrl) && <Photo ctx={ctx} src={block.imageUrl} alt="" eager className={cx('mt-12 aspect-[4/3] w-full object-cover @2xl:aspect-[21/9]', ROUNDED)} />}
        </div>
      );
    case 'stacked':
      return (
        <div>
          {text}
          {hasPhoto(ctx, block.imageUrl) && (
            <div className="relative mx-auto mt-14 max-w-5xl">
              <span aria-hidden="true" className="absolute -inset-x-3 -top-4 bottom-1/3 @2xl:-inset-x-6 @2xl:-top-6 rounded-[calc(var(--ws-radius)*2)] bg-[color:var(--s-mark)] opacity-15" />
              <Photo ctx={ctx} src={block.imageUrl} alt="" eager className={cx('relative aspect-[16/10] w-full border border-[color:var(--s-line)] object-cover shadow-2xl', ROUNDED)} />
            </div>
          )}
        </div>
      );
    case 'gradient':
    case 'center':
      return text;
    case 'full':
      return (
        <div className="flex min-h-[24rem] items-center @2xl:min-h-[60dvh]">
          <div className="w-full">{text}</div>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export function TextSection({ block, ctx, center }: SectionProps<'text'>) {
  switch (block.variant) {
    case 'columns':
      return (
        <div className="mx-auto max-w-5xl">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} className="mb-8" />
          <RichText ctx={ctx} text={block.body} className="gap-12 @3xl:columns-2 [&>*]:break-inside-avoid" />
        </div>
      );
    case 'sidebar':
      return (
        <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @3xl:gap-14">
          {block.heading ? (
            <HeadingTag ctx={ctx} blockId={block.id} className="ws-t-2">
              {block.heading}
            </HeadingTag>
          ) : (
            <span />
          )}
          <RichText ctx={ctx} text={block.body} className="ws-muted" />
        </div>
      );
    case 'lead':
      return (
        <div className={cx('max-w-3xl', center && 'mx-auto')}>
          {block.heading && (
            <HeadingTag ctx={ctx} blockId={block.id} className={cx('ws-eyebrow mb-5', center && 'text-center')}>
              {block.heading}
            </HeadingTag>
          )}
          <RichText ctx={ctx} text={block.body} className="text-xl leading-relaxed @2xl:text-2xl @2xl:leading-relaxed" />
        </div>
      );
    case 'card':
      return (
        <div className="ws-card relative mx-auto max-w-3xl overflow-hidden p-7 @2xl:p-12">
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[color:var(--s-mark)]" />
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} className="mb-6" />
          <RichText ctx={ctx} text={block.body} />
        </div>
      );
    case 'standard':
      return (
        <div className={cx('max-w-3xl', center && 'mx-auto')}>
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} className="mb-6 @2xl:mb-8" />
          <RichText ctx={ctx} text={block.body} />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Imagen y texto
// ---------------------------------------------------------------------------

export function SplitSection({ block, ctx, center }: SectionProps<'split'>) {
  const photo = hasPhoto(ctx, block.imageUrl);
  const left = block.imageSide === 'left';
  const copy = (
    <>
      <SectionHeading ctx={ctx} blockId={block.id} center={false} eyebrow={block.eyebrow} title={block.heading} className="mb-6 @2xl:mb-6" />
      <RichText ctx={ctx} text={block.body} className="ws-muted" />
      <ActionButtons ctx={ctx} center={false} primary={{ label: block.buttonLabel, href: block.buttonHref }} />
    </>
  );
  if (!photo) return <div className={cx('max-w-3xl', center && 'mx-auto')}>{copy}</div>;

  switch (block.variant) {
    case 'overlap':
      return (
        <div className="grid @3xl:grid-cols-12 @3xl:items-center">
          <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className={cx('aspect-[4/3] w-full object-cover shadow-xl @3xl:col-span-7 @3xl:row-start-1', ROUNDED, left ? '@3xl:col-start-1' : '@3xl:col-start-6')} />
          <div className={cx('ws-tone-default ws-bg relative z-10 mx-3 -mt-14 border border-[color:var(--s-line)] p-6 shadow-2xl @2xl:p-10 @3xl:col-span-6 @3xl:row-start-1 @3xl:mx-0 @3xl:mt-0', ROUNDED, left ? '@3xl:col-start-7' : '@3xl:col-start-1')}>
            {copy}
          </div>
        </div>
      );
    case 'framed':
      return (
        <div className="grid items-center gap-12 @3xl:grid-cols-2 @3xl:gap-16">
          <div className={cx(left && '@3xl:order-2')}>{copy}</div>
          <div className="relative mr-4 mb-4">
            <span aria-hidden="true" className="ws-offset" />
            <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className={cx('relative aspect-[4/3] w-full object-cover', ROUNDED)} />
          </div>
        </div>
      );
    case 'circle':
      return (
        <div className="grid items-center gap-10 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @3xl:gap-16">
          <div className={cx('mx-auto w-full max-w-sm', !left && '@3xl:order-2')}>
            <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className="aspect-square w-full rounded-full object-cover shadow-xl ring-8 ring-[color:var(--s-card)]" />
          </div>
          <div>{copy}</div>
        </div>
      );
    case 'wide':
      return (
        <div className={cx('grid items-center gap-10 @3xl:gap-14', left ? '@3xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : '@3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]')}>
          <div className={cx(left && '@3xl:order-2')}>{copy}</div>
          <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className={cx('aspect-[16/10] w-full object-cover shadow-xl', ROUNDED)} />
        </div>
      );
    case 'standard':
      return (
        <div className="grid items-center gap-10 @3xl:grid-cols-2 @3xl:gap-16">
          <div className={cx(left && '@3xl:order-2')}>{copy}</div>
          <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className={cx('aspect-[4/3] w-full object-cover shadow-xl', ROUNDED)} />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Imagen
// ---------------------------------------------------------------------------

export function ImageSection({ block, ctx }: SectionProps<'image'>) {
  const full = block.size === 'full';
  const caption = (className?: string) => (block.caption ? <figcaption className={cx('mt-3 text-center text-sm', className)}>{block.caption}</figcaption> : null);
  if (full) {
    return (
      <figure>
        <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className="w-full object-cover" />
        {caption('ws-muted px-5')}
      </figure>
    );
  }
  const width = block.size === 'normal' ? 'max-w-4xl' : '';
  switch (block.variant) {
    case 'plain':
      return (
        <figure className={cx('mx-auto', width)}>
          <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className="w-full rounded-[var(--ws-radius)] object-cover" />
          {caption('ws-muted')}
        </figure>
      );
    case 'frame':
      return (
        <figure className={cx('mx-auto', width)}>
          <div className="ws-frame">
            <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className="w-full rounded-[var(--ws-radius)] object-cover" />
          </div>
          {caption('ws-muted')}
        </figure>
      );
    case 'polaroid':
      return (
        <figure className={cx('ws-polaroid mx-auto max-w-xl -rotate-1', block.size === 'wide' && 'max-w-3xl')}>
          <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className="aspect-[4/3] w-full object-cover" />
          <figcaption className="px-2 py-4 text-center text-base">{block.caption || ' '}</figcaption>
        </figure>
      );
    case 'arch':
      return (
        <figure className={cx('mx-auto', block.size === 'wide' ? 'max-w-lg' : 'max-w-md')}>
          <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className="ws-arch aspect-[4/5] w-full object-cover shadow-xl" />
          {caption('ws-muted')}
        </figure>
      );
    case 'shadow':
      return (
        <figure className={cx('mx-auto', width)}>
          <Photo ctx={ctx} src={block.imageUrl} alt={block.alt} className="w-full rounded-[calc(var(--ws-radius)*1.2)] object-cover shadow-xl" />
          {caption('ws-muted')}
        </figure>
      );
  }
}

// ---------------------------------------------------------------------------
// Separador
// ---------------------------------------------------------------------------

/** Trazo periódico (ola o zigzag) de 1200 de ancho, dibujado con `currentColor`. */
function strokePath(kind: 'wave' | 'zigzag'): string {
  const parts: string[] = ['M0 10'];
  for (let x = 0; x < 1200; x += 40) parts.push(kind === 'wave' ? `Q${x + 10} ${x % 80 === 0 ? 0 : 20} ${x + 20} 10 T${x + 40} 10` : `L${x + 20} ${x % 80 === 0 ? 2 : 18} L${x + 40} 10`);
  return parts.join(' ');
}

function Stroke({ kind }: { kind: 'wave' | 'zigzag' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 1200 20" preserveAspectRatio="none" className="mx-auto block h-4 w-full max-w-3xl [color:var(--s-mark)]">
      <path d={strokePath(kind)} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function DividerSection({ block }: SectionProps<'divider'>) {
  const gap = block.size === 'sm' ? 'py-3' : block.size === 'lg' ? 'py-16' : 'py-8';
  const wrap = (content: ReactNode) => (
    <div role="separator" className={gap}>
      {content}
    </div>
  );
  switch (block.variant) {
    case 'space':
      return <div aria-hidden="true" className={gap} />;
    case 'dots':
      return (
        <div role="separator" className={cx('flex justify-center gap-3', gap)}>
          {[0, 1, 2].map((n) => (
            <span key={n} className="size-1.5 rounded-full bg-[color:var(--s-mark)]" />
          ))}
        </div>
      );
    case 'ornament':
      return wrap(
        <div className="mx-auto flex max-w-2xl items-center gap-5">
          <span className="h-px flex-1 bg-[color:var(--s-line)]" />
          <span aria-hidden="true" className="text-xl [color:var(--s-mark)]">
            ✦
          </span>
          <span className="h-px flex-1 bg-[color:var(--s-line)]" />
        </div>
      );
    case 'gradient':
      return wrap(<div className="ws-rule mx-auto max-w-4xl" />);
    case 'wave':
    case 'zigzag':
      return wrap(<Stroke kind={block.variant} />);
    case 'line':
      return (
        <div className={gap}>
          <hr className="border-t border-[color:var(--s-line)]" />
        </div>
      );
  }
}

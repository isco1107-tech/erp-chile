import { safeImageSrc } from '@/lib/web-sites/urls';
import { cx, Img, RichText, SectionHeading } from '../parts';
import type { SectionLook } from '../tone';
import { ActionButtons, type SectionProps } from './shared';

export function HeroSection({ block, ctx, center }: SectionProps<'hero'> & { look: SectionLook }) {
  const image = safeImageSrc(block.imageUrl);
  const Tag = ctx.h1BlockId === block.id ? 'h1' : 'h2';
  const variant = block.variant;
  const wide = variant === 'center' || variant === 'full';
  const text = (
    <div className={cx('max-w-3xl', center && 'mx-auto')}>
      {block.eyebrow && <p className="ws-eyebrow mb-5">{block.eyebrow}</p>}
      {block.title && <Tag className={cx('ws-h text-4xl @2xl:text-6xl', variant === 'full' && '@4xl:text-7xl')}>{block.title}</Tag>}
      {block.subtitle && <p className={cx('ws-muted mt-6 max-w-2xl text-lg leading-relaxed @2xl:text-xl', center && 'mx-auto')}>{block.subtitle}</p>}
      <ActionButtons ctx={ctx} center={center} primary={{ label: block.ctaLabel, href: block.ctaHref }} secondary={{ label: block.secondaryLabel, href: block.secondaryHref }} className="mt-10" />
    </div>
  );

  if (variant === 'split') {
    return (
      <div className={cx('grid items-center gap-10 @3xl:gap-14', image && '@3xl:grid-cols-[1.05fr_0.95fr]')}>
        {text}
        {image && <Img src={image} alt="" eager className="aspect-[4/3] w-full rounded-[calc(var(--ws-radius)*1.4)] object-cover shadow-2xl" />}
      </div>
    );
  }
  if (variant === 'minimal') {
    return (
      <div>
        {text}
        {image && <Img src={image} alt="" eager className="mt-12 aspect-[16/9] w-full rounded-[calc(var(--ws-radius)*1.4)] object-cover shadow-xl" />}
      </div>
    );
  }
  // center y full: el fondo (color o foto) lo pone la franja.
  return <div className={cx(wide && variant === 'full' && 'flex min-h-[24rem] items-center @2xl:min-h-[60dvh]', variant === 'full' && center && 'justify-center')}>{text}</div>;
}

export function TextSection({ block, ctx, center }: SectionProps<'text'>) {
  return (
    <div className={cx('max-w-3xl', center && 'mx-auto')}>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} className="mb-6 @2xl:mb-8" />
      <RichText ctx={ctx} text={block.body} />
    </div>
  );
}

export function SplitSection({ block, ctx, center }: SectionProps<'split'>) {
  const image = safeImageSrc(block.imageUrl);
  return (
    <div className={cx('grid items-center gap-10 @3xl:gap-16', image && '@3xl:grid-cols-2')}>
      <div className={cx(image && block.imageSide === 'left' && '@3xl:order-2', !image && 'max-w-3xl', !image && center && 'mx-auto')}>
        <SectionHeading ctx={ctx} blockId={block.id} center={false} eyebrow={block.eyebrow} title={block.heading} className="mb-6 @2xl:mb-6" />
        <RichText ctx={ctx} text={block.body} className="ws-muted" />
        <ActionButtons ctx={ctx} center={false} primary={{ label: block.buttonLabel, href: block.buttonHref }} />
      </div>
      {image && <Img src={image} alt={block.alt} className="aspect-[4/3] w-full rounded-[calc(var(--ws-radius)*1.4)] object-cover shadow-xl" />}
    </div>
  );
}

export function ImageSection({ block }: SectionProps<'image'>) {
  const full = block.size === 'full';
  return (
    <figure className={cx('mx-auto', block.size === 'normal' && 'max-w-4xl')}>
      <Img src={block.imageUrl} alt={block.alt} className={cx('w-full object-cover', !full && 'rounded-[calc(var(--ws-radius)*1.2)] shadow-xl')} />
      {block.caption && <figcaption className={cx('ws-muted mt-3 text-center text-sm', full && 'px-5')}>{block.caption}</figcaption>}
    </figure>
  );
}

export function DividerSection({ block }: SectionProps<'divider'>) {
  const gap = block.size === 'sm' ? 'py-3' : block.size === 'lg' ? 'py-16' : 'py-8';
  if (block.variant === 'space') return <div aria-hidden="true" className={gap} />;
  if (block.variant === 'dots') {
    return (
      <div role="separator" className={cx('flex justify-center gap-3', gap)}>
        {[0, 1, 2].map((n) => (
          <span key={n} className="size-1.5 rounded-full bg-[color:var(--s-mark)]" />
        ))}
      </div>
    );
  }
  return (
    <div className={gap}>
      <hr className="border-t border-[color:var(--s-line)]" />
    </div>
  );
}

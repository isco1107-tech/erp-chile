import { Plus, Quote as QuoteIcon } from 'lucide-react';
import { Fragment } from 'react';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from '../context';
import Carousel from '../Carousel';
import Marquee from '../Marquee';
import { cx, Fit, hasPhoto, HeadingTag, Img, Photo, RichText, SectionHeading, Stars } from '../parts';
import SiteLink from '../SiteLink';
import { Avatar, type SectionProps } from './shared';

// ---------------------------------------------------------------------------
// Testimonios
// ---------------------------------------------------------------------------

type Testimonial = SectionProps<'testimonials'>['block']['items'][number];

function Author({ ctx, item, size = 'size-12' }: { ctx: RenderCtx; item: Testimonial; size?: string }) {
  if (!item.author && !item.role) return null;
  return (
    <figcaption className="mt-auto flex items-center gap-3 pt-6">
      {safeImageSrc(item.photoUrl) ? <Img src={item.photoUrl} alt="" className={cx('shrink-0 rounded-full object-cover', size)} /> : item.author ? <Avatar name={item.author} className={size} /> : null}
      <span className="min-w-0 text-sm">
        <span className="block font-semibold">{item.author}</span>
        {item.role && <span className="ws-muted block">{item.role}</span>}
      </span>
    </figcaption>
  );
}

function TestimonialCard({ ctx, item, className }: { ctx: RenderCtx; item: Testimonial; className?: string }) {
  return (
    <figure className={cx('ws-card flex h-full flex-col p-6 text-left @2xl:p-7', className)}>
      <Stars rating={item.rating} />
      <blockquote className={cx('leading-relaxed', item.rating > 0 && 'mt-3')}>“{item.quote}”</blockquote>
      <Author ctx={ctx} item={item} />
    </figure>
  );
}

export function TestimonialsSection({ block, ctx, center }: SectionProps<'testimonials'>) {
  const items = block.items.filter((item) => item.quote);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} />;
  const cols = items.length >= 3 ? '@2xl:grid-cols-2 @4xl:grid-cols-3' : items.length === 2 ? '@2xl:grid-cols-2' : 'mx-auto max-w-2xl';

  switch (block.variant) {
    case 'quotes':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-12', items.length > 1 && '@3xl:grid-cols-2', items.length === 1 && 'mx-auto max-w-3xl')}>
            {items.map((item, index) => (
              <li key={index}>
                <figure className={cx(center ? 'text-center' : 'text-left')}>
                  <QuoteIcon className={cx('mb-4 size-9 opacity-80 [color:var(--s-mark)]', center && 'mx-auto')} aria-hidden="true" />
                  <blockquote className="ws-h text-2xl leading-snug font-medium @2xl:text-3xl">“{item.quote}”</blockquote>
                  <Stars rating={item.rating} />
                  {(item.author || item.role) && (
                    <figcaption className="mt-5 text-sm">
                      <span className="font-semibold">{item.author}</span>
                      {item.role && (
                        <span className="ws-muted">
                          {item.author ? ' · ' : ''}
                          {item.role}
                        </span>
                      )}
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'carousel':
      return (
        <div>
          {heading}
          <Carousel label={block.heading || 'Testimonios'} itemClassName="basis-[85%] @2xl:basis-[calc((100%-1rem)/2)] @4xl:basis-[calc((100%-2rem)/3)]">
            {items.map((item, index) => (
              <TestimonialCard key={index} ctx={ctx} item={item} />
            ))}
          </Carousel>
        </div>
      );
    case 'masonry':
      return (
        <div>
          {heading}
          <ul className="gap-5 @2xl:columns-2 @4xl:columns-3">
            {items.map((item, index) => (
              <li key={index} className="mb-5 break-inside-avoid">
                <TestimonialCard ctx={ctx} item={item} />
              </li>
            ))}
          </ul>
        </div>
      );
    case 'spotlight': {
      const [first, ...rest] = items;
      if (!first) return heading;
      const photo = hasPhoto(ctx, first.photoUrl);
      return (
        <div>
          {heading}
          <figure className={cx('grid items-center gap-10 text-left', photo && '@3xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @3xl:gap-16')}>
            {photo && <Photo ctx={ctx} src={first.photoUrl} alt="" className="mx-auto aspect-[4/5] w-full max-w-sm rounded-[calc(var(--ws-radius)*1.4)] object-cover shadow-xl" />}
            <div>
              <QuoteIcon className="mb-5 size-10 opacity-80 [color:var(--s-mark)]" aria-hidden="true" />
              <Fit><blockquote className="ws-h ws-t-quote font-medium">“{first.quote}”</blockquote></Fit>
              <div className="mt-6">
                <Stars rating={first.rating} />
              </div>
              {(first.author || first.role) && (
                <figcaption className="mt-4">
                  <span className="block text-lg font-semibold">{first.author}</span>
                  {first.role && <span className="ws-muted block">{first.role}</span>}
                </figcaption>
              )}
            </div>
          </figure>
          {rest.length > 0 && (
            <ul className={cx('mt-14 grid gap-5', rest.length >= 3 ? '@2xl:grid-cols-3' : rest.length === 2 ? '@2xl:grid-cols-2' : 'mx-auto max-w-2xl')}>
              {rest.slice(0, 6).map((item, index) => (
                <li key={index}>
                  <TestimonialCard ctx={ctx} item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'minimal':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-x-10 gap-y-12', cols)}>
            {items.map((item, index) => (
              <li key={index}>
                <figure className="flex h-full flex-col border-t-2 border-[color:var(--s-mark)] pt-6 text-left">
                  <blockquote className="text-lg leading-relaxed">“{item.quote}”</blockquote>
                  <div className="mt-4">
                    <Stars rating={item.rating} />
                  </div>
                  <Author ctx={ctx} item={item} size="size-10" />
                </figure>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'cards':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-5 @2xl:gap-6', cols)}>
            {items.map((item, index) => (
              <li key={index}>
                <TestimonialCard ctx={ctx} item={item} />
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Frase destacada
// ---------------------------------------------------------------------------

export function QuoteSection({ block, ctx, center }: SectionProps<'quote'>) {
  const caption = (className?: string) =>
    block.author || block.role ? (
      <figcaption className={cx('text-base', className)}>
        <span className="font-semibold">{block.author}</span>
        {block.role && (
          <span className="ws-muted">
            {block.author ? ' · ' : ''}
            {block.role}
          </span>
        )}
      </figcaption>
    ) : null;

  switch (block.variant) {
    case 'card':
      return (
        <figure className={cx('ws-card relative mx-auto max-w-4xl overflow-hidden px-7 py-12 @2xl:px-16 @2xl:py-16', center ? 'text-center' : 'text-left')}>
          <QuoteIcon className="pointer-events-none absolute -top-4 -left-2 size-32 opacity-10 [color:var(--s-mark)]" aria-hidden="true" />
          <Fit><blockquote className="ws-h ws-t-quote relative font-medium">“{block.quote}”</blockquote></Fit>
          {caption('relative mt-8')}
        </figure>
      );
    case 'bar':
      return (
        <figure className="mx-auto max-w-4xl border-l-4 border-[color:var(--s-mark)] pl-6 text-left @2xl:pl-10">
          <Fit><blockquote className="ws-h ws-t-quote font-medium">{block.quote}</blockquote></Fit>
          {caption('mt-6')}
        </figure>
      );
    case 'photo': {
      const photo = hasPhoto(ctx, block.photoUrl);
      return (
        <figure className={cx('mx-auto grid max-w-5xl items-center gap-8 text-left @2xl:gap-12', photo && '@2xl:grid-cols-[auto_minmax(0,1fr)]')}>
          {photo ? (
            <Photo ctx={ctx} src={block.photoUrl} alt="" className="size-36 rounded-full object-cover shadow-xl ring-4 ring-[color:var(--s-mark)] @2xl:size-48" />
          ) : null}
          <div>
            <QuoteIcon className="mb-4 size-9 opacity-80 [color:var(--s-mark)]" aria-hidden="true" />
            <Fit><blockquote className="ws-h ws-t-quote font-medium">“{block.quote}”</blockquote></Fit>
            {caption('mt-6')}
          </div>
        </figure>
      );
    }
    case 'plain':
      return (
        <figure className={cx('mx-auto max-w-4xl', center ? 'text-center' : 'text-left')}>
          <QuoteIcon className={cx('mb-6 size-10 opacity-80 [color:var(--s-mark)]', center && 'mx-auto')} aria-hidden="true" />
          <Fit><blockquote className="ws-h ws-t-quote font-medium">“{block.quote}”</blockquote></Fit>
          {caption('mt-8')}
        </figure>
      );
  }
}

// ---------------------------------------------------------------------------
// Clientes y marcas
// ---------------------------------------------------------------------------

type LogoItem = SectionProps<'logos'>['block']['items'][number];

export function LogosSection({ block, ctx, center }: SectionProps<'logos'>) {
  const items = block.items.filter((item) => hasPhoto(ctx, item.imageUrl));
  const logo = (item: LogoItem, className: string, key?: number) => {
    const link = resolveIn(ctx, item.href);
    const image = <Photo ctx={ctx} src={item.imageUrl} alt={item.alt} className={cx('ws-logo w-auto object-contain', className)} />;
    return link ? (
      <SiteLink key={key} ctx={ctx} link={link} className="ws-logo-link block">
        {image}
      </SiteLink>
    ) : (
      <Fragment key={key}>{image}</Fragment>
    );
  };
  const heading = block.heading ? <h2 className={cx('ws-eyebrow mb-8', center && 'text-center', ctx.h1BlockId === block.id && 'sr-only')}>{block.heading}</h2> : null;

  switch (block.variant) {
    case 'grid':
      return (
        <div>
          {heading}
          <ul className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-4 @2xl:gap-4">
            {items.map((item, index) => (
              <li key={index} className="ws-card flex h-24 items-center justify-center p-5 @2xl:h-28">
                {logo(item, 'h-10 max-w-full @2xl:h-12')}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'marquee':
      return (
        <div>
          {heading}
          <Marquee
            // Un logo mide entre 3 y 9 rem más el espacio: con 24 por grupo se cubre una pantalla de 2560 px.
            repeat={Math.ceil(24 / Math.max(1, items.length))}
            seconds={Math.max(28, items.length * 5)}
            className="-mx-5 @2xl:mx-0"
            groupClassName="gap-12 pr-12 @2xl:gap-16 @2xl:pr-16"
            items={items.map((item, index) => (
              <span key={index} className="block shrink-0">
                {logo(item, 'h-9 max-w-[9rem] @2xl:h-12')}
              </span>
            ))}
          />
        </div>
      );
    case 'row':
      return (
        <div>
          {heading}
          <ul className={cx('flex flex-wrap items-center gap-x-10 gap-y-6 @2xl:gap-x-14', center && 'justify-center')}>
            {items.map((item, index) => (
              <li key={index}>{logo(item, 'h-9 max-w-[9rem] @2xl:h-12')}</li>
            ))}
          </ul>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Preguntas frecuentes
// ---------------------------------------------------------------------------

type FaqItem = SectionProps<'faq'>['block']['items'][number];

function Accordion({ ctx, items }: { ctx: RenderCtx; items: FaqItem[] }) {
  return (
    <div className="divide-y divide-[color:var(--s-line)] border-y border-[color:var(--s-line)]">
      {items.map((item, index) => (
        <details key={index} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{item.question}</span>
            <Plus className="size-5 shrink-0 transition-transform group-open:rotate-45 [color:var(--s-mark)]" aria-hidden="true" />
          </summary>
          {item.answer && <RichText ctx={ctx} text={item.answer} className="ws-muted pr-8 pb-5" />}
        </details>
      ))}
    </div>
  );
}

export function FaqSection({ block, ctx, center }: SectionProps<'faq'>) {
  const items = block.items.filter((item) => item.question);
  switch (block.variant) {
    case 'split':
      return (
        <div className="grid gap-10 text-left @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] @3xl:gap-16">
          <div className="@3xl:sticky @3xl:top-24 @3xl:self-start">
            {block.heading && (
              <HeadingTag ctx={ctx} blockId={block.id} className="ws-t-2">
                {block.heading}
              </HeadingTag>
            )}
            {block.intro && <p className="ws-muted mt-4 text-lg leading-relaxed">{block.intro}</p>}
          </div>
          <Accordion ctx={ctx} items={items} />
        </div>
      );
    case 'columns': {
      const half = Math.ceil(items.length / 2);
      return (
        <div className="text-left">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
          <div className="grid gap-x-12 @3xl:grid-cols-2">
            <Accordion ctx={ctx} items={items.slice(0, half)} />
            {items.length > half && (
              <div className="-mt-px @3xl:mt-0">
                <Accordion ctx={ctx} items={items.slice(half)} />
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'cards':
      return (
        <div>
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
          <ul className={cx('grid gap-5 text-left', items.length > 1 && '@2xl:grid-cols-2')}>
            {items.map((item, index) => (
              <li key={index} className="ws-card p-6 @2xl:p-7">
                <h3 className="ws-h text-lg">{item.question}</h3>
                {item.answer && <RichText ctx={ctx} text={item.answer} className="ws-muted mt-3 !text-base" />}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'accordion':
      return (
        <div className="mx-auto max-w-3xl text-left">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
          <Accordion ctx={ctx} items={items} />
        </div>
      );
  }
}

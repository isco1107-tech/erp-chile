import { Plus, Quote as QuoteIcon } from 'lucide-react';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { resolveIn } from '../context';
import { cx, Img, RichText, SectionHeading, Stars } from '../parts';
import SiteLink from '../SiteLink';
import { Avatar, type SectionProps } from './shared';

export function TestimonialsSection({ block, ctx, center }: SectionProps<'testimonials'>) {
  const items = block.items.filter((item) => item.quote);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} />;

  if (block.variant === 'quotes') {
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
                    {item.role && <span className="ws-muted">{item.author ? ' · ' : ''}{item.role}</span>}
                  </figcaption>
                )}
              </figure>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const cols = items.length >= 3 ? '@2xl:grid-cols-2 @4xl:grid-cols-3' : items.length === 2 ? '@2xl:grid-cols-2' : 'mx-auto max-w-2xl';
  return (
    <div>
      {heading}
      <ul className={cx('grid gap-5 @2xl:gap-6', cols)}>
        {items.map((item, index) => (
          <li key={index}>
            <figure className="ws-card flex h-full flex-col p-6 text-left @2xl:p-7">
              <Stars rating={item.rating} />
              <blockquote className={cx('leading-relaxed', item.rating > 0 && 'mt-3')}>“{item.quote}”</blockquote>
              {(item.author || item.role) && (
                <figcaption className="mt-auto flex items-center gap-3 pt-6">
                  {safeImageSrc(item.photoUrl) ? <Img src={item.photoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" /> : item.author ? <Avatar name={item.author} className="size-12" /> : null}
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold">{item.author}</span>
                    {item.role && <span className="ws-muted block">{item.role}</span>}
                  </span>
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QuoteSection({ block, center }: SectionProps<'quote'>) {
  return (
    <figure className={cx('mx-auto max-w-4xl', center ? 'text-center' : 'text-left')}>
      <QuoteIcon className={cx('mb-6 size-10 opacity-80 [color:var(--s-mark)]', center && 'mx-auto')} aria-hidden="true" />
      <blockquote className="ws-h text-3xl leading-tight font-medium @2xl:text-5xl">“{block.quote}”</blockquote>
      {(block.author || block.role) && (
        <figcaption className="mt-8 text-base">
          <span className="font-semibold">{block.author}</span>
          {block.role && <span className="ws-muted">{block.author ? ' · ' : ''}{block.role}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export function LogosSection({ block, ctx, center }: SectionProps<'logos'>) {
  const items = block.items.filter((item) => safeImageSrc(item.imageUrl));
  return (
    <div>
      {block.heading && (
        <h2 className={cx('ws-eyebrow mb-8', center && 'text-center', ctx.h1BlockId === block.id && 'sr-only')}>{block.heading}</h2>
      )}
      <ul className={cx('flex flex-wrap items-center gap-x-10 gap-y-6 @2xl:gap-x-14', center && 'justify-center')}>
        {items.map((item, index) => {
          const link = resolveIn(ctx, item.href);
          const image = <Img src={item.imageUrl} alt={item.alt} className="ws-logo h-9 w-auto max-w-[9rem] object-contain @2xl:h-12" />;
          return (
            <li key={index}>
              {link ? (
                <SiteLink ctx={ctx} link={link} className="ws-logo-link block">
                  {image}
                </SiteLink>
              ) : (
                image
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FaqSection({ block, ctx, center }: SectionProps<'faq'>) {
  const items = block.items.filter((item) => item.question);
  return (
    <div className="mx-auto max-w-3xl text-left">
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} />
      <div className="divide-y divide-[color:var(--s-line)] border-y border-[color:var(--s-line)]">
        {items.map((item, index) => (
          <details key={index} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <Plus className="size-5 shrink-0 transition-transform group-open:rotate-45 [color:var(--s-mark)]" aria-hidden="true" />
            </summary>
            {item.answer && <RichText ctx={ctx} text={item.answer} className="ws-muted pr-8 pb-5" />}
          </details>
        ))}
      </div>
    </div>
  );
}

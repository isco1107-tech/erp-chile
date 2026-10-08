import { ArrowRight, Check } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { safeImageSrc, whatsappHref } from '@/lib/web-sites/urls';
import { resolveIn, type RenderCtx } from '../context';
import Carousel from '../Carousel';
import { SiteIconView } from '../icons';
import { CheckRow, cx, Fit, hasPhoto, HeadingTag, Photo, SectionHeading } from '../parts';
import SiteLink from '../SiteLink';
import { Avatar, gridColumns, type SectionProps } from './shared';

const ROUNDED = 'rounded-[calc(var(--ws-radius)*1.4)]';
const CAROUSEL_ITEM = 'basis-[82%] @2xl:basis-[calc((100%-1rem)/2)] @4xl:basis-[calc((100%-2rem)/3)]';

/** Envoltorio que se vuelve enlace si la tarjeta lleva a algún lado. */
function MaybeLink({ ctx, href, className, children }: { ctx: RenderCtx; href: string; className: string; children: ReactNode }) {
  const link = resolveIn(ctx, href);
  if (!link) return <div className={className}>{children}</div>;
  return (
    <SiteLink ctx={ctx} link={link} className={className}>
      {children}
    </SiteLink>
  );
}

function MoreLabel() {
  return (
    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold [color:var(--s-mark)]">
      Ver más <ArrowRight className="size-4" aria-hidden="true" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Servicios o beneficios
// ---------------------------------------------------------------------------

type FeatureItem = SectionProps<'features'>['block']['items'][number];

/** Columnas del mosaico: la primera tarjeta ocupa dos columnas y dos filas; la última rellena el hueco. */
function bentoClass(index: number, count: number): string {
  if (count < 3) return '';
  if (index === 0) return '@md:col-span-2 @3xl:row-span-2';
  if (index !== count - 1) return '';
  const md = (count - 1) % 2 === 1 ? '@md:col-span-2' : '';
  const rest = (count - 3) % 3;
  const wide = count > 3 && rest === 1 ? '@3xl:col-span-3' : count > 3 && rest === 2 ? '@3xl:col-span-2' : '@3xl:col-span-1';
  return cx(md, wide);
}

export function FeaturesSection({ block, ctx, center }: SectionProps<'features'>) {
  const items = block.items.filter((item) => item.title || item.text);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;
  const icon = (item: FeatureItem, className?: string) => (
    <span className={cx('ws-icon-tile', className)}>
      <SiteIconView name={item.icon || 'sparkles'} className="size-6" />
    </span>
  );
  const linked = (item: FeatureItem) => Boolean(resolveIn(ctx, item.href));

  switch (block.variant) {
    case 'list':
      return (
        <div className={cx(center && 'mx-auto', 'max-w-4xl')}>
          {heading}
          <ul className={cx('grid gap-x-12 gap-y-5', items.length > 3 && '@2xl:grid-cols-2')}>
            {items.map((item, index) => (
              <li key={index} className="text-left">
                <CheckRow icon={<SiteIconView name={item.icon || 'check'} className="size-5" />}>
                  <span className="font-semibold">{item.title}</span>
                  {item.text && (
                    <span className="ws-muted">
                      {item.title ? ' ' : ''}
                      {item.text}
                    </span>
                  )}
                </CheckRow>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'bento':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-4 @2xl:gap-5', items.length >= 3 ? '@md:grid-cols-2 @3xl:grid-cols-3' : gridColumns(items.length, 2))}>
            {items.map((item, index) => {
              const first = index === 0 && items.length >= 3;
              const photo = hasPhoto(ctx, item.imageUrl);
              return (
                <li key={index} className={bentoClass(index, items.length)}>
                  <MaybeLink ctx={ctx} href={item.href} className={cx('flex h-full flex-col overflow-hidden text-left', first ? cx('ws-tone-primary ws-bg', ROUNDED) : 'ws-card', linked(item) && 'ws-card-hover')}>
                    {photo && <Photo ctx={ctx} src={item.imageUrl} alt="" className={cx('w-full object-cover', first ? 'aspect-[16/9] @3xl:aspect-auto @3xl:min-h-0 @3xl:flex-1' : 'aspect-[16/9]')} />}
                    <div className={cx('p-6 @2xl:p-7', first && '@2xl:p-9')}>
                      {!photo && icon(item, 'mb-5')}
                      {item.title && <h3 className={cx('ws-h', first ? 'text-2xl @2xl:text-3xl' : 'text-xl')}>{item.title}</h3>}
                      {item.text && <p className={cx('ws-muted mt-2 leading-relaxed', first && '@2xl:text-lg')}>{item.text}</p>}
                      {linked(item) && <MoreLabel />}
                    </div>
                  </MaybeLink>
                </li>
              );
            })}
          </ul>
        </div>
      );
    case 'zigzag':
      return (
        <div>
          {heading}
          <ul className="space-y-14 @3xl:space-y-20">
            {items.map((item, index) => {
              const photo = hasPhoto(ctx, item.imageUrl);
              return (
                <li key={index} className={cx('grid items-center gap-8 text-left @3xl:gap-14', '@3xl:grid-cols-2')}>
                  <div className={cx(index % 2 === 1 && '@3xl:order-2')}>
                    {photo ? <Photo ctx={ctx} src={item.imageUrl} alt="" className={cx('aspect-[4/3] w-full object-cover shadow-xl', ROUNDED)} /> : <span className={cx('ws-icon-tile !flex aspect-[4/3] !h-auto !w-full', ROUNDED)}><SiteIconView name={item.icon || 'sparkles'} className="size-14" /></span>}
                  </div>
                  <div>
                    <p className="ws-eyebrow mb-3">{String(index + 1).padStart(2, '0')}</p>
                    {item.title && (
                      <Fit>
                        <h3 className="ws-h ws-t-2">{item.title}</h3>
                      </Fit>
                    )}
                    {item.text && <p className="ws-muted mt-4 text-lg leading-relaxed">{item.text}</p>}
                    {linked(item) && (
                      <MaybeLink ctx={ctx} href={item.href} className="inline-block">
                        <MoreLabel />
                      </MaybeLink>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      );
    case 'numbered':
    case 'minimal':
      return (
        <div>
          {heading}
          <ol className={cx('grid gap-x-8 gap-y-10', gridColumns(items.length, Number(block.columns)))}>
            {items.map((item, index) => (
              <li key={index} className={cx('text-left', block.variant === 'minimal' ? 'border-t-2 border-[color:var(--s-mark)] pt-5' : 'border-t border-[color:var(--s-line)] pt-6')}>
                <MaybeLink ctx={ctx} href={item.href} className="block">
                  {block.variant === 'numbered' && <p className="ws-h ws-num mb-4 text-5xl">{String(index + 1).padStart(2, '0')}</p>}
                  {item.title && <h3 className="ws-h text-xl">{item.title}</h3>}
                  {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
                  {linked(item) && <MoreLabel />}
                </MaybeLink>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'overlay':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-4 @2xl:gap-5', gridColumns(items.length, Number(block.columns)))}>
            {items.map((item, index) => {
              const photo = hasPhoto(ctx, item.imageUrl);
              return (
                <li key={index}>
                  <MaybeLink ctx={ctx} href={item.href} className={cx('ws-tone-dark ws-bg relative flex h-full min-h-[20rem] flex-col justify-end overflow-hidden text-left @2xl:min-h-[24rem]', ROUNDED, linked(item) && 'ws-card-hover')}>
                    {photo && <Photo ctx={ctx} src={item.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                    <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/.82),rgb(0_0_0/.25)_55%,transparent)]" />
                    <div className="relative p-6 @2xl:p-7">
                      {!photo && icon(item, 'mb-4')}
                      {item.title && <h3 className="ws-h text-2xl">{item.title}</h3>}
                      {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
                    </div>
                  </MaybeLink>
                </li>
              );
            })}
          </ul>
        </div>
      );
    case 'carousel':
      return (
        <div>
          {heading}
          <Carousel label={block.heading || 'Servicios'} itemClassName={CAROUSEL_ITEM}>
            {items.map((item, index) => (
              <MaybeLink key={index} ctx={ctx} href={item.href} className={cx('ws-card block h-full overflow-hidden text-left', linked(item) && 'ws-card-hover')}>
                {hasPhoto(ctx, item.imageUrl) ? <Photo ctx={ctx} src={item.imageUrl} alt="" className="aspect-[16/10] w-full object-cover" /> : null}
                <div className="p-6">
                  {!hasPhoto(ctx, item.imageUrl) && icon(item, 'mb-5')}
                  {item.title && <h3 className="ws-h text-xl">{item.title}</h3>}
                  {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
                  {linked(item) && <MoreLabel />}
                </div>
              </MaybeLink>
            ))}
          </Carousel>
        </div>
      );
    case 'cards':
    case 'icons': {
      const cards = block.variant === 'cards';
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-5 @2xl:gap-6', gridColumns(items.length, Number(block.columns)))}>
            {items.map((item, index) => {
              const image = cards && hasPhoto(ctx, item.imageUrl);
              const body = (
                <>
                  {image ? (
                    <Photo ctx={ctx} src={item.imageUrl} alt="" className="mb-5 aspect-[16/10] w-full rounded-[calc(var(--ws-radius)*.8)] object-cover" />
                  ) : item.icon || !cards ? (
                    icon(item, cx('mb-5', !cards && 'size-14 rounded-full', !cards && center && 'mx-auto'))
                  ) : null}
                  {item.title && <h3 className="ws-h text-xl">{item.title}</h3>}
                  {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
                  {linked(item) && <MoreLabel />}
                </>
              );
              return (
                <li key={index}>
                  <MaybeLink ctx={ctx} href={item.href} className={cx('block h-full text-left', cards ? 'ws-card p-6 @2xl:p-7' : 'p-2', cards && linked(item) && 'ws-card-hover', !cards && center && 'text-center')}>
                    {body}
                  </MaybeLink>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cifras
// ---------------------------------------------------------------------------

export function StatsSection({ block, ctx, center }: SectionProps<'stats'>) {
  const items = block.items.filter((item) => item.value);
  const cols = Math.min(items.length, 4);
  const wide = cols >= 4 ? '@2xl:grid-cols-4' : cols === 3 ? '@2xl:grid-cols-3' : cols === 2 ? '@2xl:grid-cols-2' : '@2xl:grid-cols-1';
  const odd = '[&>li:last-child:nth-child(odd)]:col-span-2 @2xl:[&>li:last-child:nth-child(odd)]:col-span-1';
  const stat = (item: (typeof items)[number], className?: string) => (
    <>
      <Fit>
        <p className={cx('ws-h ws-t-stat [color:var(--s-mark)]', className)}>{item.value}</p>
      </Fit>
      {item.label && <p className="ws-muted mt-2 text-xs font-medium tracking-wide break-words uppercase @md:text-sm @md:tracking-wider">{item.label}</p>}
    </>
  );

  switch (block.variant) {
    case 'cards':
      return (
        <div>
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
          <ul className={cx('grid grid-cols-2 gap-3 text-center @2xl:gap-5', odd, wide)}>
            {items.map((item, index) => (
              <li key={index} className="ws-card px-3 py-7 @2xl:px-5 @2xl:py-9">
                {stat(item)}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'divided':
      return (
        <div>
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
          <ul className={cx('grid grid-cols-2 border-y border-[color:var(--s-line)] text-center', odd, wide)}>
            {items.map((item, index) => (
              <li key={index} className="border-[color:var(--s-line)] px-3 py-8 [&:nth-child(even)]:border-l [&:nth-child(n+3)]:border-t @2xl:not-first:border-l @2xl:[&:nth-child(n+3)]:border-t-0">
                {stat(item)}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'side':
      return (
        <div className="grid gap-10 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] @3xl:items-center @3xl:gap-16">
          <div>
            {block.heading && (
              <HeadingTag ctx={ctx} blockId={block.id} className="ws-t-lg">
                {block.heading}
              </HeadingTag>
            )}
            {block.intro && <p className="ws-muted mt-4 text-lg leading-relaxed">{block.intro}</p>}
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-10">
            {items.map((item, index) => (
              <li key={index} className="border-l-2 border-[color:var(--s-mark)] pl-4 text-left">
                {stat(item)}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'plain':
      return (
        <div>
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
          <ul className={cx('grid grid-cols-2 gap-x-6 gap-y-10 text-center', odd, wide)}>
            {items.map((item, index) => (
              <li key={index}>{stat(item)}</li>
            ))}
          </ul>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Cómo funciona
// ---------------------------------------------------------------------------

const STEP_COLS: Record<number, string> = { 1: '', 2: '@3xl:grid-cols-2', 3: '@3xl:grid-cols-3', 4: '@3xl:grid-cols-4' };

function StepNumber({ n, className }: { n: number; className?: string }) {
  return <span className={cx('ws-h flex size-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--s-btn)] text-lg text-[color:var(--s-btn-fg)]', className)}>{n}</span>;
}

export function StepsSection({ block, ctx, center }: SectionProps<'steps'>) {
  const items = block.items.filter((item) => item.title || item.text);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;
  const cols = STEP_COLS[items.length] ?? '@3xl:grid-cols-3 @5xl:grid-cols-4';

  switch (block.variant) {
    case 'horizontal':
      return (
        <div>
          {heading}
          <ol className={cx('grid gap-8 text-left @3xl:gap-6', cols)}>
            {items.map((item, index) => (
              <li key={index} className="relative flex gap-4 @3xl:block @3xl:after:absolute @3xl:after:top-[1.375rem] @3xl:after:right-0 @3xl:after:left-14 @3xl:after:h-px @3xl:after:bg-[color:var(--s-line)] @3xl:last:after:hidden">
                <StepNumber n={index + 1} />
                <div className="min-w-0 @3xl:mt-5 @3xl:pr-4">
                  {item.title && <h3 className="ws-h pt-2 text-xl @3xl:pt-0">{item.title}</h3>}
                  {item.text && <p className="ws-muted mt-1.5 leading-relaxed">{item.text}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'cards':
      return (
        <div>
          {heading}
          <ol className={cx('grid gap-5 text-left', gridColumns(items.length, Math.min(items.length, 4)))}>
            {items.map((item, index) => (
              <li key={index} className="ws-card relative overflow-hidden p-6 @2xl:p-7">
                <span aria-hidden="true" className="ws-h ws-num pointer-events-none absolute top-2 right-4 text-6xl leading-none opacity-20">
                  {index + 1}
                </span>
                <StepNumber n={index + 1} className="mb-5" />
                {item.title && <h3 className="ws-h text-xl">{item.title}</h3>}
                {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
              </li>
            ))}
          </ol>
        </div>
      );
    case 'timeline':
      return (
        <div>
          {heading}
          <ol className="relative mx-auto max-w-4xl text-left before:absolute before:top-2 before:bottom-2 before:left-[1.35rem] before:w-px before:bg-[color:var(--s-line)] @3xl:before:left-1/2">
            {items.map((item, index) => (
              <li key={index} className="relative grid pb-10 pl-16 last:pb-0 @3xl:grid-cols-2 @3xl:gap-16 @3xl:pl-0">
                <StepNumber n={index + 1} className="absolute top-0 left-0 @3xl:left-1/2 @3xl:-translate-x-1/2" />
                <div className={cx('pt-2', index % 2 === 0 ? '@3xl:text-right' : '@3xl:col-start-2')}>
                  {item.title && <h3 className="ws-h text-xl">{item.title}</h3>}
                  {item.text && <p className="ws-muted mt-1.5 leading-relaxed">{item.text}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'vertical':
      return (
        <div>
          {heading}
          <ol className={cx('max-w-2xl text-left', center && 'mx-auto')}>
            {items.map((item, index) => (
              <li key={index} className="relative pb-10 pl-16 before:absolute before:top-12 before:bottom-0 before:left-[1.35rem] before:w-px before:bg-[color:var(--s-line)] last:pb-0 last:before:hidden">
                <StepNumber n={index + 1} className="absolute top-0 left-0" />
                {item.title && <h3 className="ws-h pt-2 text-xl">{item.title}</h3>}
                {item.text && <p className="ws-muted mt-1.5 leading-relaxed">{item.text}</p>}
              </li>
            ))}
          </ol>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Planes y precios
// ---------------------------------------------------------------------------

function planFeatures(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s+/, '').trim())
    .filter(Boolean);
}

type Plan = SectionProps<'pricing'>['block']['items'][number];

/** Precio del plan. `inline`: va en una fila que se ajusta a su contenido, donde no cabe un contenedor `ws-fit` (mediría cero). */
function PlanPrice({ plan, className, inline = false }: { plan: Plan; className?: string; inline?: boolean }) {
  if (!plan.price) return null;
  const price = (
    <p className={cx('flex flex-wrap items-baseline gap-x-1.5', inline && className)}>
      <span className={cx('ws-h', inline ? 'min-w-0 text-[1.75rem] leading-none break-words @2xl:text-3xl' : 'ws-t-price')}>{plan.price}</span>
      {plan.period && <span className="ws-muted text-sm">{plan.period}</span>}
    </p>
  );
  if (inline) return price;
  return <Fit className={className}>{price}</Fit>;
}

function PlanFeatures({ plan, className }: { plan: Plan; className?: string }) {
  const features = planFeatures(plan.features);
  if (features.length === 0) return null;
  return (
    <ul className={cx('space-y-3 text-[0.95rem]', className)}>
      {features.map((feature, i) => (
        <li key={i}>
          <CheckRow icon={<Check className="size-5" aria-hidden="true" />}>{feature}</CheckRow>
        </li>
      ))}
    </ul>
  );
}

export function PricingSection({ block, ctx, center }: SectionProps<'pricing'>) {
  const items = block.items.filter((plan) => plan.name || plan.price);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;
  const button = (plan: Plan, main: boolean, className?: string) => {
    const link = plan.buttonLabel ? resolveIn(ctx, plan.buttonHref) : null;
    if (!link) return null;
    return (
      <SiteLink ctx={ctx} link={link} className={cx('ws-btn', main ? 'ws-btn-main' : 'ws-btn-alt', className)}>
        {plan.buttonLabel}
      </SiteLink>
    );
  };

  if (block.variant === 'list') {
    return (
      <div className="mx-auto max-w-4xl">
        {heading}
        <ul className="space-y-4">
          {items.map((plan, index) => (
            <li key={index} className={cx('ws-card relative flex flex-col gap-5 p-6 text-left @2xl:flex-row @2xl:items-center @2xl:gap-8 @2xl:p-7', plan.highlighted && 'ring-2 ring-[color:var(--s-mark)]')}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {plan.name && <h3 className="ws-h min-w-0 text-xl break-words">{plan.name}</h3>}
                  {plan.highlighted && plan.badge && <span className="ws-pill">{plan.badge}</span>}
                </div>
                {plan.description && <p className="ws-muted mt-1 text-sm leading-relaxed">{plan.description}</p>}
                {planFeatures(plan.features).length > 0 && <p className="ws-muted mt-3 text-sm">{planFeatures(plan.features).join(' · ')}</p>}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-5 @2xl:max-w-[45%] @2xl:shrink-0 @2xl:flex-col @2xl:items-end @2xl:gap-3">
                <PlanPrice plan={plan} inline className="@2xl:justify-end @2xl:text-right" />
                {button(plan, plan.highlighted, 'ws-btn-sm')}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const grid = items.length === 1 ? 'mx-auto max-w-md' : items.length === 2 ? 'mx-auto max-w-3xl @2xl:grid-cols-2' : items.length === 3 ? 'mx-auto max-w-md @4xl:max-w-none @4xl:grid-cols-3' : '@2xl:grid-cols-2 @5xl:grid-cols-3';

  if (block.variant === 'minimal') {
    return (
      <div>
        {heading}
        <ul className={cx('grid gap-y-10', grid, '@4xl:gap-x-0')}>
          {items.map((plan, index) => (
            <li key={index} className={cx('relative flex flex-col border-t-2 px-1 pt-7 text-left @4xl:px-8', plan.highlighted ? 'border-[color:var(--s-mark)]' : 'border-[color:var(--s-line)]', '@4xl:not-first:border-l @4xl:not-first:border-l-[color:var(--s-line)]')}>
              {plan.highlighted && plan.badge && <span className="ws-eyebrow mb-3">{plan.badge}</span>}
              {plan.name && <h3 className="ws-h text-xl">{plan.name}</h3>}
              {plan.description && <p className="ws-muted mt-2 text-sm leading-relaxed">{plan.description}</p>}
              <PlanPrice plan={plan} className="mt-6" />
              <PlanFeatures plan={plan} className="mt-6 grow" />
              {button(plan, plan.highlighted, 'mt-8 w-full')}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      {heading}
      <ul className={cx('grid items-stretch gap-6 @4xl:gap-8', grid)}>
        {items.map((plan, index) => {
          const hl = plan.highlighted;
          return (
            <li key={index} className={cx(hl && '@4xl:z-10 @4xl:scale-[1.03]')}>
              <div className={cx('relative flex h-full flex-col p-7 text-left @2xl:p-8', ROUNDED, hl ? 'ws-tone-primary ws-bg shadow-2xl ring-1 ring-[color:var(--s-mark)]' : 'ws-card')}>
                {plan.badge && <span className="absolute -top-3 left-7 rounded-full bg-[color:var(--s-btn)] px-3 py-1 text-xs font-bold text-[color:var(--s-btn-fg)]">{plan.badge}</span>}
                {plan.name && <h3 className="ws-h text-xl">{plan.name}</h3>}
                {plan.description && <p className="ws-muted mt-2 text-sm leading-relaxed">{plan.description}</p>}
                <PlanPrice plan={plan} className="mt-6" />
                <PlanFeatures plan={plan} className="mt-6 grow border-t border-[color:var(--s-line)] pt-6" />
                {button(plan, hl, 'mt-8 w-full')}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------

type Member = SectionProps<'team'>['block']['items'][number];

export function TeamSection({ block, ctx, center }: SectionProps<'team'>) {
  const items = block.items.filter((member) => member.name);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;
  const cols = items.length >= 4 ? '@2xl:grid-cols-3 @4xl:grid-cols-4' : items.length === 3 ? '@2xl:grid-cols-3' : items.length === 2 ? '@2xl:grid-cols-2 mx-auto max-w-2xl' : 'mx-auto max-w-xs';
  const names = (member: Member, className?: string) => (
    <>
      <h3 className={cx('ws-h text-lg', className)}>{member.name}</h3>
      {member.role && <p className="mt-0.5 text-sm font-semibold [color:var(--s-mark)]">{member.role}</p>}
    </>
  );

  switch (block.variant) {
    case 'cards':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-5 @md:grid-cols-2', cols)}>
            {items.map((member, index) => (
              <li key={index} className="ws-card overflow-hidden text-left">
                {hasPhoto(ctx, member.photoUrl) ? (
                  <Photo ctx={ctx} src={member.photoUrl} alt="" className="aspect-[4/5] w-full object-cover" />
                ) : (
                  <Avatar name={member.name} className="!flex aspect-[4/5] !h-auto !w-full !rounded-none text-5xl" />
                )}
                <div className="p-5">
                  {names(member)}
                  {member.bio && <p className="ws-muted mt-3 text-sm leading-relaxed">{member.bio}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'portrait':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-4 @md:grid-cols-2', cols)}>
            {items.map((member, index) => (
              <li key={index} className={cx('ws-tone-dark ws-bg relative flex min-h-[22rem] flex-col justify-end overflow-hidden text-left @2xl:min-h-[26rem]', ROUNDED)}>
                {hasPhoto(ctx, member.photoUrl) ? (
                  <Photo ctx={ctx} src={member.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="ws-h absolute inset-0 flex items-center justify-center text-7xl opacity-30">
                    {member.name.charAt(0)}
                  </span>
                )}
                <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/.8),transparent_55%)]" />
                <div className="relative p-5">
                  {names(member, 'text-xl')}
                  {member.bio && <p className="ws-muted mt-2 text-sm leading-relaxed">{member.bio}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'list':
      return (
        <div className="mx-auto max-w-5xl">
          {heading}
          <ul className={cx('grid gap-x-12 gap-y-8', items.length > 1 && '@3xl:grid-cols-2')}>
            {items.map((member, index) => (
              <li key={index} className="flex items-start gap-5 text-left">
                {safeImageSrc(member.photoUrl) || ctx.placeholders ? <Photo ctx={ctx} src={member.photoUrl} alt="" className="size-20 shrink-0 rounded-full object-cover @2xl:size-24" /> : <Avatar name={member.name} className="!size-20 text-2xl @2xl:!size-24" />}
                <div className="min-w-0">
                  {names(member)}
                  {member.bio && <p className="ws-muted mt-2 text-sm leading-relaxed">{member.bio}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'circles':
      return (
        <div>
          {heading}
          <ul className={cx('grid grid-cols-2 gap-x-5 gap-y-10 text-center', cols)}>
            {items.map((member, index) => (
              <li key={index}>
                {hasPhoto(ctx, member.photoUrl) ? <Photo ctx={ctx} src={member.photoUrl} alt="" className="mx-auto aspect-square w-full max-w-[13rem] rounded-full object-cover shadow-lg" /> : <Avatar name={member.name} className="mx-auto !size-28 text-3xl" />}
                {names(member, 'mt-5')}
                {member.bio && <p className="ws-muted mx-auto mt-3 max-w-xs text-sm leading-relaxed">{member.bio}</p>}
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Lista de precios
// ---------------------------------------------------------------------------

type PriceItem = SectionProps<'pricelist'>['block']['categories'][number]['items'][number];

function PriceRow({ item, center }: { item: PriceItem; center?: boolean }) {
  return (
    <>
      {/* Si el nombre y el precio no caben juntos, el precio baja a la línea siguiente (con su guía de puntos) en vez de estrujar el nombre. */}
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="max-w-full min-w-0 font-semibold break-words">{item.name}</span>
        {item.tag && <span className="ws-pill self-center">{item.tag}</span>}
        {item.price && (
          <>
            <span aria-hidden="true" className="min-w-4 flex-1 border-b-2 border-dotted border-[color:var(--s-line)]" />
            <span className="max-w-full min-w-0 text-right font-semibold break-words tabular-nums">{item.price}</span>
          </>
        )}
      </div>
      {item.description && <p className={cx('ws-muted mt-1 text-sm leading-relaxed', center && 'text-center italic')}>{item.description}</p>}
    </>
  );
}

export function PricelistSection({ block, ctx, center }: SectionProps<'pricelist'>) {
  const categories = block.categories.map((category) => ({ ...category, items: category.items.filter((item) => item.name) })).filter((category) => category.items.length > 0);
  const many = categories.length > 1;
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;
  const note = block.note ? <p className={cx('ws-muted mt-2 text-sm', center && 'text-center')}>{block.note}</p> : null;

  switch (block.variant) {
    case 'menu':
      return (
        <div className="mx-auto max-w-2xl">
          {heading}
          {categories.map((category, index) => (
            <section key={index} className="mb-12 text-left last:mb-6">
              {category.title && (
                <h3 className="ws-h mb-6 flex items-center gap-4 text-center text-2xl [color:var(--s-mark)]">
                  <span aria-hidden="true" className="h-px flex-1 bg-[color:var(--s-line)]" />
                  <span className="min-w-0">{category.title}</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-[color:var(--s-line)]" />
                </h3>
              )}
              <ul className="space-y-5">
                {category.items.map((item, i) => (
                  <li key={i}>
                    <PriceRow item={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {note}
        </div>
      );
    case 'cards':
      return (
        <div>
          {heading}
          <div className={cx('grid gap-5 text-left', many ? '@3xl:grid-cols-2' : 'mx-auto max-w-2xl')}>
            {categories.map((category, index) => (
              <section key={index} className="ws-card p-6 @2xl:p-8">
                {category.title && <h3 className="ws-h mb-5 text-xl [color:var(--s-mark)]">{category.title}</h3>}
                <ul className="space-y-4">
                  {category.items.map((item, i) => (
                    <li key={i}>
                      <PriceRow item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {note}
        </div>
      );
    case 'photos':
      return (
        <div>
          {heading}
          {categories.map((category, index) => (
            <section key={index} className="mb-12 text-left last:mb-6">
              {category.title && <h3 className="ws-h mb-5 border-b border-[color:var(--s-line)] pb-3 text-xl [color:var(--s-mark)]">{category.title}</h3>}
              <ul className="grid gap-x-10 gap-y-6 @3xl:grid-cols-2">
                {category.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    {hasPhoto(ctx, item.imageUrl) && <Photo ctx={ctx} src={item.imageUrl} alt={item.name} className="size-20 shrink-0 rounded-[var(--ws-radius)] object-cover @2xl:size-24" />}
                    <div className="min-w-0 flex-1">
                      <PriceRow item={item} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {note}
        </div>
      );
    case 'columns':
      return (
        <div>
          {heading}
          <div className={cx('gap-x-16 text-left', many ? '@3xl:columns-2' : 'mx-auto max-w-2xl')}>
            {categories.map((category, index) => (
              <section key={index} className="mb-10 break-inside-avoid">
                {category.title && <h3 className="ws-h mb-4 border-b border-[color:var(--s-line)] pb-3 text-xl [color:var(--s-mark)]">{category.title}</h3>}
                <ul className="space-y-4">
                  {category.items.map((item, i) => (
                    <li key={i}>
                      <PriceRow item={item} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {note}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

type CatalogItem = SectionProps<'catalog'>['block']['items'][number];

function OrderButton({ children }: { children: ReactNode }) {
  return children ? <div className="mt-5">{children}</div> : null;
}

export function CatalogSection({ block, ctx, center }: SectionProps<'catalog'>) {
  const items = block.items.filter((item) => item.title || hasPhoto(ctx, item.imageUrl));
  const number = block.whatsapp || ctx.doc.whatsapp.number;
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;
  const order = (item: CatalogItem, className: string) => {
    const message = `Hola, me interesa: ${item.title || 'este producto'}${item.code ? ` (código ${item.code})` : ''}`;
    const link = resolveIn(ctx, whatsappHref(number, message));
    if (!link) return null;
    return (
      <SiteLink ctx={ctx} link={link} className={className}>
        {block.buttonLabel || 'Pedir por WhatsApp'}
      </SiteLink>
    );
  };
  const badge = (item: CatalogItem) => (item.badge ? <span className="absolute top-3 left-3 rounded-full bg-[color:var(--s-btn)] px-3 py-1 text-xs font-bold text-[color:var(--s-btn-fg)] shadow">{item.badge}</span> : null);
  const info = (item: CatalogItem) => (
    <>
      {item.title && <h3 className="ws-h text-lg">{item.title}</h3>}
      {item.price && <p className="ws-h mt-1 text-2xl [color:var(--s-mark)]">{item.price}</p>}
      {item.details && <p className="ws-muted mt-2 text-xs font-medium tracking-wide">{item.details}</p>}
      {item.description && <p className="ws-muted mt-3 text-sm leading-relaxed">{item.description}</p>}
    </>
  );
  const card = (item: CatalogItem) => {
    const photo = hasPhoto(ctx, item.imageUrl);
    const button = order(item, 'ws-btn ws-btn-main ws-btn-sm w-full');
    return (
      <article className="ws-card flex h-full flex-col overflow-hidden text-left">
        {photo && (
          <div className="relative">
            <Photo ctx={ctx} src={item.imageUrl} alt={item.title} className="aspect-[4/3] w-full object-cover" />
            {badge(item)}
          </div>
        )}
        <div className="flex grow flex-col p-5 @2xl:p-6">
          {!photo && item.badge && <span className="ws-pill mb-3 self-start">{item.badge}</span>}
          {info(item)}
          {button && <div className="mt-auto pt-5">{button}</div>}
        </div>
      </article>
    );
  };

  switch (block.variant) {
    case 'list':
      return (
        <div className="mx-auto max-w-5xl">
          {heading}
          <ul className="space-y-5">
            {items.map((item, index) => (
              <li key={index}>
                <article className="ws-card flex flex-col overflow-hidden text-left @2xl:flex-row">
                  {hasPhoto(ctx, item.imageUrl) && (
                    <div className="relative @2xl:w-72 @2xl:shrink-0">
                      <Photo ctx={ctx} src={item.imageUrl} alt={item.title} className="aspect-[4/3] h-full w-full object-cover" />
                      {badge(item)}
                    </div>
                  )}
                  <div className="flex min-w-0 grow flex-col p-5 @2xl:p-7">
                    {info(item)}
                    <OrderButton>{order(item, 'ws-btn ws-btn-main ws-btn-sm')}</OrderButton>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'carousel':
      return (
        <div>
          {heading}
          <Carousel label={block.heading || 'Catálogo'} itemClassName={CAROUSEL_ITEM}>
            {items.map((item, index) => (
              <Fragment key={index}>{card(item)}</Fragment>
            ))}
          </Carousel>
        </div>
      );
    case 'minimal':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-x-6 gap-y-12', gridColumns(items.length, Number(block.columns)))}>
            {items.map((item, index) => (
              <li key={index} className="flex flex-col text-left">
                {hasPhoto(ctx, item.imageUrl) && (
                  <div className="relative mb-5">
                    <Photo ctx={ctx} src={item.imageUrl} alt={item.title} className={cx('aspect-[4/5] w-full object-cover', ROUNDED)} />
                    {badge(item)}
                  </div>
                )}
                {info(item)}
                <OrderButton>{order(item, 'ws-btn ws-btn-alt ws-btn-sm')}</OrderButton>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'grid':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-5 @2xl:gap-6', gridColumns(items.length, Number(block.columns)))}>
            {items.map((item, index) => (
              <li key={index} className="h-full">
                {card(item)}
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Horario o programa
// ---------------------------------------------------------------------------

type ScheduleRow = SectionProps<'schedule'>['block']['rows'][number];

function groupRows(rows: ScheduleRow[]): { day: string; rows: ScheduleRow[] }[] {
  const groups: { day: string; rows: ScheduleRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.day.toLowerCase() === row.day.toLowerCase()) last.rows.push(row);
    else groups.push({ day: row.day, rows: [row] });
  }
  return groups;
}

export function ScheduleSection({ block, ctx, center }: SectionProps<'schedule'>) {
  const rows = block.rows.filter((row) => row.title || row.time);
  // Filas seguidas con el mismo día se agrupan bajo ese día.
  const groups = groupRows(rows);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;

  switch (block.variant) {
    case 'table':
      return (
        <div className="mx-auto max-w-4xl">
          {heading}
          <div className="ws-card hidden overflow-hidden text-left @2xl:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[color:var(--s-line)] text-sm">
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Día
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Hora
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    Actividad
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-b border-[color:var(--s-line)] last:border-b-0">
                    <td className="px-5 py-3.5 font-semibold [color:var(--s-mark)]">{row.day}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap tabular-nums">{row.time}</td>
                    <td className="px-5 py-3.5">
                      <span className="block font-medium">{row.title}</span>
                      {row.detail && <span className="ws-muted block text-sm">{row.detail}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ws-card divide-y divide-[color:var(--s-line)] text-left @2xl:hidden">
            {rows.map((row, index) => (
              <li key={index} className="px-5 py-3.5">
                <span className="block text-sm font-semibold [color:var(--s-mark)]">{[row.day, row.time].filter(Boolean).join(' · ')}</span>
                <span className="block font-medium">{row.title}</span>
                {row.detail && <span className="ws-muted block text-sm">{row.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      );
    case 'timeline':
      return (
        <div className="mx-auto max-w-3xl">
          {heading}
          <div className="space-y-10 text-left">
            {groups.map((group, index) => (
              <section key={index}>
                {group.day && <h3 className="ws-h mb-4 text-2xl [color:var(--s-mark)]">{group.day}</h3>}
                <ol className="relative ml-1 border-l-2 border-[color:var(--s-line)]">
                  {group.rows.map((row, i) => (
                    <li key={i} className="relative pb-6 pl-6 last:pb-0">
                      <span aria-hidden="true" className="absolute top-1.5 -left-[0.45rem] size-3 rounded-full bg-[color:var(--s-mark)]" />
                      {row.time && <p className="text-sm font-semibold tabular-nums [color:var(--s-mark)]">{row.time}</p>}
                      {row.title && <p className="text-lg font-semibold">{row.title}</p>}
                      {row.detail && <p className="ws-muted text-sm">{row.detail}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      );
    case 'cards': {
      const cols = groups.length >= 3 ? '@2xl:grid-cols-2 @4xl:grid-cols-3' : groups.length === 2 ? '@2xl:grid-cols-2' : 'mx-auto max-w-2xl';
      return (
        <div>
          {heading}
          <div className={cx('grid gap-5 text-left', cols)}>
            {groups.map((group, index) => (
              <section key={index} className="ws-card p-5 @2xl:p-6">
                {group.day && <h3 className="ws-h mb-3 text-xl [color:var(--s-mark)]">{group.day}</h3>}
                <ul className="divide-y divide-[color:var(--s-line)]">
                  {group.rows.map((row, i) => (
                    <li key={i} className="flex gap-4 py-3 first:pt-0 last:pb-0">
                      {row.time && <span className="w-24 shrink-0 font-semibold tabular-nums">{row.time}</span>}
                      <span className="min-w-0">
                        {row.title && <span className="block font-medium">{row.title}</span>}
                        {row.detail && <span className="ws-muted block text-sm">{row.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      );
    }
  }
}

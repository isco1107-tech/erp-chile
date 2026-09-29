import { ArrowRight, Check } from 'lucide-react';
import { whatsappHref, safeImageSrc } from '@/lib/web-sites/urls';
import { resolveIn } from '../context';
import { SiteIconView } from '../icons';
import { CheckRow, cx, Img, SectionHeading } from '../parts';
import SiteLink from '../SiteLink';
import { Avatar, gridColumns, type SectionProps } from './shared';

export function FeaturesSection({ block, ctx, center }: SectionProps<'features'>) {
  const items = block.items.filter((item) => item.title || item.text);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;

  if (block.variant === 'list') {
    return (
      <div className={cx(center && 'mx-auto', 'max-w-4xl')}>
        {heading}
        <ul className={cx('grid gap-x-12 gap-y-5', items.length > 3 && '@2xl:grid-cols-2')}>
          {items.map((item, index) => (
            <li key={index} className="text-left">
              <CheckRow icon={<SiteIconView name={item.icon || 'check'} className="size-5" />}>
                <span className="font-semibold">{item.title}</span>
                {item.text && <span className="ws-muted">{item.title ? ' ' : ''}{item.text}</span>}
              </CheckRow>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const cards = block.variant === 'cards';
  return (
    <div>
      {heading}
      <ul className={cx('grid gap-5 @2xl:gap-6', gridColumns(items.length, Number(block.columns)))}>
        {items.map((item, index) => {
          const link = resolveIn(ctx, item.href);
          const image = safeImageSrc(item.imageUrl);
          const body = (
            <>
              {cards && image ? (
                <Img src={image} alt="" className="mb-5 aspect-[16/10] w-full rounded-[calc(var(--ws-radius)*.8)] object-cover" />
              ) : item.icon || !cards ? (
                <span className={cx('ws-icon-tile mb-5', !cards && 'size-14 rounded-full', !cards && center && 'mx-auto')}>
                  <SiteIconView name={item.icon || 'sparkles'} className="size-6" />
                </span>
              ) : null}
              {item.title && <h3 className="ws-h text-xl">{item.title}</h3>}
              {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
              {link && (
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold [color:var(--s-mark)]">
                  Ver más <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              )}
            </>
          );
          const boxed = cx('block h-full text-left', cards ? 'ws-card p-6 @2xl:p-7' : 'p-2', cards && link && 'ws-card-hover', !cards && center && 'text-center');
          return (
            <li key={index}>
              {link ? (
                <SiteLink ctx={ctx} link={link} className={boxed}>
                  {body}
                </SiteLink>
              ) : (
                <div className={boxed}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StatsSection({ block, ctx, center }: SectionProps<'stats'>) {
  const items = block.items.filter((item) => item.value);
  const cols = Math.min(items.length, 4);
  const wide = cols >= 4 ? '@2xl:grid-cols-4' : cols === 3 ? '@2xl:grid-cols-3' : cols === 2 ? '@2xl:grid-cols-2' : '@2xl:grid-cols-1';
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <ul className={cx('grid grid-cols-2 gap-x-6 gap-y-10 text-center [&>li:last-child:nth-child(odd)]:col-span-2 @2xl:[&>li:last-child:nth-child(odd)]:col-span-1', wide)}>
        {items.map((item, index) => (
          <li key={index}>
            <p className="ws-h text-5xl @2xl:text-6xl [color:var(--s-mark)]">{item.value}</p>
            {item.label && <p className="ws-muted mt-2 text-sm font-medium tracking-wider uppercase">{item.label}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StepsSection({ block, ctx, center }: SectionProps<'steps'>) {
  const items = block.items.filter((item) => item.title || item.text);
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <ol className={cx('max-w-2xl text-left', center && 'mx-auto')}>
        {items.map((item, index) => (
          <li
            key={index}
            className="relative pb-10 pl-16 before:absolute before:top-12 before:bottom-0 before:left-[1.35rem] before:w-px before:bg-[color:var(--s-line)] last:pb-0 last:before:hidden"
          >
            <span className="ws-h absolute top-0 left-0 flex size-11 items-center justify-center rounded-full bg-[color:var(--s-btn)] text-lg text-[color:var(--s-btn-fg)]">{index + 1}</span>
            {item.title && <h3 className="ws-h pt-2 text-xl">{item.title}</h3>}
            {item.text && <p className="ws-muted mt-1.5 leading-relaxed">{item.text}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function planFeatures(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s+/, '').trim())
    .filter(Boolean);
}

export function PricingSection({ block, ctx, center }: SectionProps<'pricing'>) {
  const items = block.items.filter((plan) => plan.name || plan.price);
  const grid = items.length === 1 ? 'mx-auto max-w-md' : items.length === 2 ? 'mx-auto max-w-3xl @2xl:grid-cols-2' : items.length === 3 ? 'mx-auto max-w-md @4xl:max-w-none @4xl:grid-cols-3' : '@2xl:grid-cols-2 @5xl:grid-cols-3';
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <ul className={cx('grid items-stretch gap-6 @4xl:gap-8', grid)}>
        {items.map((plan, index) => {
          const hl = plan.highlighted;
          const link = plan.buttonLabel ? resolveIn(ctx, plan.buttonHref) : null;
          const features = planFeatures(plan.features);
          return (
            <li key={index} className={cx(hl && '@4xl:z-10 @4xl:scale-[1.03]')}>
              <div
                className={cx(
                  'relative flex h-full flex-col rounded-[calc(var(--ws-radius)*1.4)] p-7 text-left @2xl:p-8',
                  hl ? 'ws-tone-primary ws-bg shadow-2xl ring-1 ring-[color:var(--s-mark)]' : 'ws-card'
                )}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-7 rounded-full bg-[color:var(--s-btn)] px-3 py-1 text-xs font-bold text-[color:var(--s-btn-fg)]">{plan.badge}</span>
                )}
                {plan.name && <h3 className="ws-h text-xl">{plan.name}</h3>}
                {plan.description && <p className="ws-muted mt-2 text-sm leading-relaxed">{plan.description}</p>}
                {plan.price && (
                  <p className="mt-6 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="ws-h text-4xl @2xl:text-5xl">{plan.price}</span>
                    {plan.period && <span className="ws-muted text-sm">{plan.period}</span>}
                  </p>
                )}
                {features.length > 0 && (
                  <ul className="mt-6 grow space-y-3 border-t border-[color:var(--s-line)] pt-6 text-[0.95rem]">
                    {features.map((feature, i) => (
                      <li key={i}>
                        <CheckRow icon={<Check className="size-5" aria-hidden="true" />}>{feature}</CheckRow>
                      </li>
                    ))}
                  </ul>
                )}
                {link && (
                  <div className="mt-8">
                    <SiteLink ctx={ctx} link={link} className={cx('ws-btn w-full', hl ? 'ws-btn-main' : 'ws-btn-alt')}>
                      {plan.buttonLabel}
                    </SiteLink>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TeamSection({ block, ctx, center }: SectionProps<'team'>) {
  const items = block.items.filter((member) => member.name);
  const cols = items.length >= 4 ? '@2xl:grid-cols-3 @4xl:grid-cols-4' : items.length === 3 ? '@2xl:grid-cols-3' : items.length === 2 ? '@2xl:grid-cols-2 mx-auto max-w-2xl' : 'mx-auto max-w-xs';
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <ul className={cx('grid grid-cols-2 gap-x-5 gap-y-10 text-center', cols)}>
        {items.map((member, index) => (
          <li key={index}>
            {safeImageSrc(member.photoUrl) ? (
              <Img src={member.photoUrl} alt="" className="mx-auto aspect-square w-full max-w-[13rem] rounded-full object-cover shadow-lg" />
            ) : (
              <Avatar name={member.name} className="mx-auto !size-28 text-3xl" />
            )}
            <h3 className="ws-h mt-5 text-lg">{member.name}</h3>
            {member.role && <p className="mt-0.5 text-sm font-semibold [color:var(--s-mark)]">{member.role}</p>}
            {member.bio && <p className="ws-muted mx-auto mt-3 max-w-xs text-sm leading-relaxed">{member.bio}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricelistSection({ block, ctx, center }: SectionProps<'pricelist'>) {
  const categories = block.categories.map((category) => ({ ...category, items: category.items.filter((item) => item.name) })).filter((category) => category.items.length > 0);
  const many = categories.length > 1;
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <div className={cx('gap-x-16 text-left', many ? '@3xl:columns-2' : 'mx-auto max-w-2xl')}>
        {categories.map((category, index) => (
          <section key={index} className="mb-10 break-inside-avoid">
            {category.title && <h3 className="ws-h mb-4 border-b border-[color:var(--s-line)] pb-3 text-xl [color:var(--s-mark)]">{category.title}</h3>}
            <ul className="space-y-4">
              {category.items.map((item, i) => (
                <li key={i}>
                  <div className="flex items-baseline gap-3">
                    <span className="font-semibold">{item.name}</span>
                    {item.tag && <span className="ws-pill self-center">{item.tag}</span>}
                    {item.price && (
                      <>
                        <span aria-hidden="true" className="min-w-4 flex-1 border-b-2 border-dotted border-[color:var(--s-line)]" />
                        <span className="font-semibold whitespace-nowrap tabular-nums">{item.price}</span>
                      </>
                    )}
                  </div>
                  {item.description && <p className="ws-muted mt-1 text-sm leading-relaxed">{item.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {block.note && <p className="ws-muted mt-2 text-sm">{block.note}</p>}
    </div>
  );
}

export function CatalogSection({ block, ctx, center }: SectionProps<'catalog'>) {
  const items = block.items.filter((item) => item.title || safeImageSrc(item.imageUrl));
  const number = block.whatsapp || ctx.doc.whatsapp.number;
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      <ul className={cx('grid gap-5 @2xl:gap-6', gridColumns(items.length, Number(block.columns)))}>
        {items.map((item, index) => {
          const message = `Hola, me interesa: ${item.title || 'este producto'}${item.code ? ` (código ${item.code})` : ''}`;
          const link = resolveIn(ctx, whatsappHref(number, message));
          const image = safeImageSrc(item.imageUrl);
          return (
            <li key={index} className="h-full">
              <article className="ws-card flex h-full flex-col overflow-hidden text-left">
                {image && (
                  <div className="relative">
                    <Img src={image} alt={item.title} className="aspect-[4/3] w-full object-cover" />
                    {item.badge && <span className="absolute top-3 left-3 rounded-full bg-[color:var(--s-btn)] px-3 py-1 text-xs font-bold text-[color:var(--s-btn-fg)] shadow">{item.badge}</span>}
                  </div>
                )}
                <div className="flex grow flex-col p-5 @2xl:p-6">
                  {!image && item.badge && <span className="ws-pill mb-3 self-start">{item.badge}</span>}
                  {item.title && <h3 className="ws-h text-lg">{item.title}</h3>}
                  {item.price && <p className="ws-h mt-1 text-2xl [color:var(--s-mark)]">{item.price}</p>}
                  {item.details && <p className="ws-muted mt-2 text-xs font-medium tracking-wide">{item.details}</p>}
                  {item.description && <p className="ws-muted mt-3 text-sm leading-relaxed">{item.description}</p>}
                  {link && (
                    <div className="mt-auto pt-5">
                      <SiteLink ctx={ctx} link={link} className="ws-btn ws-btn-main ws-btn-sm w-full">
                        {block.buttonLabel || 'Pedir por WhatsApp'}
                      </SiteLink>
                    </div>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ScheduleSection({ block, ctx, center }: SectionProps<'schedule'>) {
  const rows = block.rows.filter((row) => row.title || row.time);
  // Filas seguidas con el mismo día se agrupan bajo ese día.
  const groups: { day: string; rows: typeof rows }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.day.toLowerCase() === row.day.toLowerCase()) last.rows.push(row);
    else groups.push({ day: row.day, rows: [row] });
  }
  const cols = groups.length >= 3 ? '@2xl:grid-cols-2 @4xl:grid-cols-3' : groups.length === 2 ? '@2xl:grid-cols-2' : 'mx-auto max-w-2xl';
  return (
    <div>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
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

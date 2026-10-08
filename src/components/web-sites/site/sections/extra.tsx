import { ArrowRight, Check, MapPin, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { comparisonMark } from '@/lib/web-sites/blocks';
import { dayHoursText, DAY_NAMES, groupWeek, hasDefinedHours, isDayDefined } from '@/lib/web-sites/hours';
import { resolveIn, type RenderCtx } from '../context';
import Carousel from '../Carousel';
import HoursStatusBadge from '../HoursStatus';
import Marquee from '../Marquee';
import { cx, hasPhoto, Photo, RichText, SectionHeading } from '../parts';
import SiteLink from '../SiteLink';
import SiteTabs from '../SiteTabs';
import { ActionButtons, gridColumns, type SectionProps } from './shared';

const ROUNDED = 'rounded-[calc(var(--ws-radius)*1.4)]';

// ---------------------------------------------------------------------------
// Línea de tiempo
// ---------------------------------------------------------------------------

type Milestone = SectionProps<'timeline'>['block']['items'][number];

function MilestoneBody({ ctx, item, align = 'left' }: { ctx: RenderCtx; item: Milestone; align?: 'left' | 'right' }) {
  return (
    <div className={cx(align === 'right' && '@3xl:text-right')}>
      {item.date && <p className="ws-h ws-num text-2xl">{item.date}</p>}
      {item.title && <h3 className="ws-h mt-1 text-xl">{item.title}</h3>}
      {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
      {hasPhoto(ctx, item.imageUrl) && <Photo ctx={ctx} src={item.imageUrl} alt="" className={cx('mt-4 aspect-[16/10] w-full max-w-md object-cover', ROUNDED, align === 'right' && '@3xl:ml-auto')} />}
    </div>
  );
}

const DOT = 'size-4 rounded-full border-4 border-[color:var(--s-bg)] bg-[color:var(--s-mark)] ring-2 ring-[color:var(--s-mark)]';

export function TimelineSection({ block, ctx, center }: SectionProps<'timeline'>) {
  const items = block.items.filter((item) => item.title || item.date || item.text);
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;

  switch (block.variant) {
    case 'vertical':
      return (
        <div className="mx-auto max-w-3xl">
          {heading}
          <ol className="relative ml-2 border-l-2 border-[color:var(--s-line)] text-left">
            {items.map((item, index) => (
              <li key={index} className="relative pb-12 pl-8 last:pb-0">
                <span aria-hidden="true" className={cx('absolute top-2 -left-[0.56rem]', DOT)} />
                <MilestoneBody ctx={ctx} item={item} />
              </li>
            ))}
          </ol>
        </div>
      );
    case 'horizontal':
      return (
        <div>
          {heading}
          <Carousel label={block.heading || 'Línea de tiempo'} itemClassName="basis-[78%] @2xl:basis-[calc((100%-2rem)/3)] @4xl:basis-[calc((100%-3rem)/4)]">
            {items.map((item, index) => (
              <div key={index} className="relative border-t-2 border-[color:var(--s-line)] pt-7 text-left">
                <span aria-hidden="true" className={cx('absolute -top-[0.56rem] left-0', DOT)} />
                <MilestoneBody ctx={ctx} item={item} />
              </div>
            ))}
          </Carousel>
        </div>
      );
    case 'cards':
      return (
        <div>
          {heading}
          <ol className={cx('grid gap-5 text-left', gridColumns(items.length, 3))}>
            {items.map((item, index) => (
              <li key={index} className="ws-card overflow-hidden">
                {hasPhoto(ctx, item.imageUrl) && <Photo ctx={ctx} src={item.imageUrl} alt="" className="aspect-[16/10] w-full object-cover" />}
                <div className="p-6">
                  {item.date && <p className="ws-h ws-num text-4xl">{item.date}</p>}
                  {item.title && <h3 className="ws-h mt-2 text-xl">{item.title}</h3>}
                  {item.text && <p className="ws-muted mt-2 leading-relaxed">{item.text}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'alternating':
      return (
        <div>
          {heading}
          <ol className="relative mx-auto max-w-5xl text-left before:absolute before:top-0 before:bottom-0 before:left-[0.45rem] before:w-0.5 before:bg-[color:var(--s-line)] @3xl:before:left-1/2 @3xl:before:-ml-px">
            {items.map((item, index) => (
              <li key={index} className="relative grid pb-12 pl-9 last:pb-0 @3xl:grid-cols-2 @3xl:gap-16 @3xl:pl-0">
                <span aria-hidden="true" className={cx('absolute top-2 left-0 @3xl:left-1/2 @3xl:-ml-2', DOT)} />
                <div className={cx(index % 2 === 1 && '@3xl:col-start-2')}>
                  <MilestoneBody ctx={ctx} item={item} align={index % 2 === 0 ? 'right' : 'left'} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Tabla comparativa
// ---------------------------------------------------------------------------

function Mark({ value }: { value: string }) {
  switch (comparisonMark(value)) {
    case 'yes':
      return (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-[color:var(--s-mark)] text-[color:var(--s-btn-fg)]">
          <Check className="size-4" aria-hidden="true" />
          <span className="sr-only">Sí</span>
        </span>
      );
    case 'no':
      return (
        <span className="ws-muted inline-flex size-7 items-center justify-center rounded-full border border-[color:var(--s-line)]">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">No</span>
        </span>
      );
    case 'text':
      return <span className="font-medium">{value}</span>;
    case 'empty':
      return <span className="ws-muted">—</span>;
  }
}

export function ComparisonSection({ block, ctx, center }: SectionProps<'comparison'>) {
  const columns = block.columns.map((column, index) => ({ title: column.title, index })).filter((column) => column.title.trim());
  const rows = block.rows.filter((row) => row.label.trim());
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;

  if (block.variant === 'versus') {
    const pair = columns.slice(0, 2);
    return (
      <div className="mx-auto max-w-4xl">
        {heading}
        <div className={cx('grid gap-5 text-left', pair.length === 2 && '@2xl:grid-cols-2')}>
          {pair.map((column) => {
            const hl = column.index === block.highlight;
            return (
              <div key={column.index} className={cx('p-6 @2xl:p-8', hl ? cx('ws-tone-primary ws-bg shadow-2xl', ROUNDED) : 'ws-card')}>
                <h3 className="ws-h text-2xl">{column.title}</h3>
                <ul className="mt-6 space-y-4">
                  {rows.map((row, index) => {
                    const value = row.values[column.index] ?? '';
                    const mark = comparisonMark(value);
                    return (
                      <li key={index} className="flex items-start gap-3">
                        <span className="shrink-0">{mark === 'text' || mark === 'empty' ? <Mark value={mark === 'empty' ? '' : 'sí'} /> : <Mark value={value} />}</span>
                        <span className={cx('min-w-0 pt-0.5', mark === 'no' && 'ws-muted')}>
                          {row.label}
                          {mark === 'text' && <span className="font-semibold">: {value}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {heading}
      <div className="overflow-x-auto pb-2">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr>
              <td className="p-3" />
              {columns.map((column) => (
                <th key={column.index} scope="col" className={cx('ws-h p-4 text-center text-lg', column.index === block.highlight && 'rounded-t-[var(--ws-radius)] bg-[color:var(--s-mark)] text-[color:var(--s-btn-fg)]')}>
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-[color:var(--s-line)] last:border-b-0">
                <th scope="row" className="p-4 font-medium">
                  {row.label}
                </th>
                {columns.map((column) => (
                  <td key={column.index} className={cx('p-4 text-center', column.index === block.highlight && 'bg-[color:color-mix(in_srgb,var(--s-mark)_10%,transparent)]')}>
                    <Mark value={row.values[column.index] ?? ''} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cinta de frases
// ---------------------------------------------------------------------------

const MARQUEE_SECONDS = { slow: 60, normal: 38, fast: 22 } as const;

export function MarqueeSection({ block }: SectionProps<'marquee'>) {
  const items = block.items.filter((item) => item.text.trim());
  const star = (
    <span aria-hidden="true" className="[color:var(--s-mark)]">
      ✦
    </span>
  );
  if (block.variant === 'static') {
    return (
      <p className="ws-h flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-lg @2xl:text-2xl">
        {items.map((item, index) => (
          <span key={index} className="inline-flex max-w-full items-center gap-5">
            {index > 0 && star}
            <span className="min-w-0">{item.text}</span>
          </span>
        ))}
      </p>
    );
  }
  const big = block.variant === 'big';
  // Ancho estimado de un grupo con la letra más grande que puede tocar (texto 1,5 rem o título 7,25 rem): se repite hasta cubrir 2560 px.
  const charPx = big ? 72 : 15;
  const gapPx = big ? 120 : 80;
  const groupPx = items.reduce((sum, item) => sum + item.text.length * charPx + gapPx, 0);
  const repeat = Math.ceil(2600 / Math.max(1, groupPx));
  const seconds = (MARQUEE_SECONDS[block.speed] * (big ? 1.6 : 1) * Math.max(1, groupPx * repeat)) / 2600;
  return (
    <Marquee
      repeat={repeat}
      seconds={Math.round(seconds)}
      className="-mx-5 @2xl:-mx-8"
      groupClassName={big ? 'gap-10 pr-10' : 'gap-8 pr-8'}
      items={items.map((item, index) => (
        <span key={index} className={cx('ws-h flex shrink-0 items-center whitespace-nowrap', big ? 'ws-t-xl gap-10' : 'gap-8 text-xl @2xl:text-2xl')}>
          <span className={cx(big && index % 2 === 1 && 'ws-outline-text')}>{item.text}</span>
          {star}
        </span>
      ))}
    />
  );
}

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------

export function TabsSection({ block, ctx, center }: SectionProps<'tabs'>) {
  const items = block.items.filter((item) => item.label.trim() || item.body.trim());
  const panel = (item: (typeof items)[number]): ReactNode => {
    const photo = hasPhoto(ctx, item.imageUrl);
    return (
      <div className={cx('grid items-center gap-8 text-left @3xl:gap-12', photo && block.variant !== 'side' && '@3xl:grid-cols-2')}>
        <div>
          {item.title && <h3 className="ws-h text-2xl @2xl:text-3xl">{item.title}</h3>}
          <RichText ctx={ctx} text={item.body} className={cx('ws-muted', item.title && 'mt-4')} />
          <ActionButtons ctx={ctx} center={false} primary={{ label: item.buttonLabel, href: item.buttonHref }} />
        </div>
        {photo && <Photo ctx={ctx} src={item.imageUrl} alt="" className={cx('aspect-[4/3] w-full object-cover shadow-xl', ROUNDED)} />}
      </div>
    );
  };
  return (
    <div className={cx(block.variant === 'pills' && 'mx-auto max-w-5xl')}>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      {items.length === 1 ? (
        panel(items[0]!)
      ) : (
        <div className={cx(block.variant === 'side' ? 'ws-tabs-side' : block.variant === 'pills' ? 'ws-tabs-pills' : 'ws-tabs-top', 'text-left')}>
          <SiteTabs labels={items.map((item, index) => item.label || `Pestaña ${index + 1}`)} panels={items.map(panel)} variant={block.variant} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horario de atención
// ---------------------------------------------------------------------------

export function HoursSection({ block, ctx, center }: SectionProps<'hours'>) {
  const groups = groupWeek(block.week);
  const status = block.showStatus && hasDefinedHours(block.week) && !ctx.placeholders ? <HoursStatusBadge week={block.week} /> : null;
  const note = block.note ? <p className="ws-muted mt-5 text-sm">{block.note}</p> : null;

  switch (block.variant) {
    case 'table':
      return (
        <div className="mx-auto max-w-xl">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
          {status && <div className="mb-6 flex justify-center">{status}</div>}
          <dl className="ws-card divide-y divide-[color:var(--s-line)] text-left">
            {DAY_NAMES.map((name, index) =>
              isDayDefined(block.week[index]) ? (
                <div key={name} className="flex items-baseline justify-between gap-4 px-5 py-3">
                  <dt className="font-semibold">{name}</dt>
                  <dd className={cx('text-right tabular-nums', block.week[index]?.closed && 'ws-muted')}>{dayHoursText(block.week[index])}</dd>
                </div>
              ) : null
            )}
          </dl>
          {note}
        </div>
      );
    case 'inline':
      return (
        <div className="mx-auto max-w-4xl">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} className="mb-8" />
          {status && <div className="mb-6 flex justify-center">{status}</div>}
          <ul className="flex flex-wrap justify-center gap-3">
            {groups.map((group) => (
              <li key={group.from} className="ws-card rounded-full px-5 py-2.5 text-sm">
                <span className="font-semibold">{group.short}</span>
                <span className={cx('ml-2 tabular-nums', group.closed && 'ws-muted')}>{group.hours}</span>
              </li>
            ))}
          </ul>
          {note && <div className="text-center">{note}</div>}
        </div>
      );
    case 'card':
      return (
        <div className="mx-auto max-w-lg">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} className="mb-8" />
          <div className="ws-card p-6 text-left @2xl:p-8">
            {status && <div className="mb-6">{status}</div>}
            <dl className="space-y-3">
              {groups.map((group) => (
                <div key={group.from} className="flex items-baseline justify-between gap-4">
                  <dt className="font-semibold">{group.label}</dt>
                  <dd className={cx('text-right tabular-nums', group.closed && 'ws-muted')}>{group.hours}</dd>
                </div>
              ))}
            </dl>
            {note}
          </div>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Zonas de cobertura
// ---------------------------------------------------------------------------

export function AreasSection({ block, ctx, center }: SectionProps<'areas'>) {
  const items = block.items.filter((item) => item.name.trim());
  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />
      {block.variant === 'columns' ? (
        <ul className="columns-1 gap-8 text-left @sm:columns-2 @2xl:columns-3 @4xl:columns-4">
          {items.map((item, index) => (
            <li key={index} className="mb-3 flex break-inside-avoid items-start gap-2">
              <Check className="mt-1 size-4 shrink-0 [color:var(--s-mark)]" aria-hidden="true" />
              <span className="min-w-0">{item.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={cx('flex flex-wrap gap-2.5', center && 'justify-center')}>
          {items.map((item, index) => (
            <li key={index} className="ws-card inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-medium">
              <MapPin className="size-4 shrink-0 [color:var(--s-mark)]" aria-hidden="true" />
              <span className="min-w-0">{item.name}</span>
            </li>
          ))}
        </ul>
      )}
      {block.note && <p className={cx('ws-muted mt-8 text-sm', center && 'text-center')}>{block.note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------

type Post = SectionProps<'posts'>['block']['items'][number];

function PostMeta({ item }: { item: Post }) {
  if (!item.tag && !item.date) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      {item.tag && <span className="ws-pill">{item.tag}</span>}
      {item.date && <span className="ws-muted">{item.date}</span>}
    </p>
  );
}

function PostLink({ ctx, item, children, className }: { ctx: RenderCtx; item: Post; children: ReactNode; className: string }) {
  const link = resolveIn(ctx, item.href);
  return link ? (
    <SiteLink ctx={ctx} link={link} className={cx(className, 'ws-card-hover')}>
      {children}
    </SiteLink>
  ) : (
    <div className={className}>{children}</div>
  );
}

function ReadMore({ ctx, item }: { ctx: RenderCtx; item: Post }) {
  return resolveIn(ctx, item.href) ? (
    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold [color:var(--s-mark)]">
      Leer más <ArrowRight className="size-4" aria-hidden="true" />
    </span>
  ) : null;
}

export function PostsSection({ block, ctx, center }: SectionProps<'posts'>) {
  const items = block.items.filter((item) => item.title.trim());
  const heading = <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} />;

  switch (block.variant) {
    case 'list':
      return (
        <div className="mx-auto max-w-4xl">
          {heading}
          <ul className="space-y-5">
            {items.map((item, index) => (
              <li key={index}>
                <PostLink ctx={ctx} item={item} className="ws-card flex flex-col overflow-hidden text-left @2xl:flex-row">
                  {hasPhoto(ctx, item.imageUrl) && <Photo ctx={ctx} src={item.imageUrl} alt="" className="aspect-[16/10] w-full object-cover @2xl:w-64 @2xl:shrink-0" />}
                  <div className="min-w-0 p-6">
                    <PostMeta item={item} />
                    <h3 className="ws-h mt-3 text-xl">{item.title}</h3>
                    {item.excerpt && <p className="ws-muted mt-2 leading-relaxed">{item.excerpt}</p>}
                    <ReadMore ctx={ctx} item={item} />
                  </div>
                </PostLink>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'featured': {
      const [first, ...rest] = items;
      if (!first) return heading;
      return (
        <div>
          {heading}
          <div className={cx('grid gap-6 text-left', rest.length > 0 && '@3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]')}>
            <PostLink ctx={ctx} item={first} className="ws-card block overflow-hidden">
              {hasPhoto(ctx, first.imageUrl) && <Photo ctx={ctx} src={first.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />}
              <div className="p-6 @2xl:p-8">
                <PostMeta item={first} />
                <h3 className="ws-h mt-3 text-2xl @2xl:text-3xl">{first.title}</h3>
                {first.excerpt && <p className="ws-muted mt-3 text-lg leading-relaxed">{first.excerpt}</p>}
                <ReadMore ctx={ctx} item={first} />
              </div>
            </PostLink>
            {rest.length > 0 && (
              <ul className="space-y-4">
                {rest.slice(0, 5).map((item, index) => (
                  <li key={index}>
                    <PostLink ctx={ctx} item={item} className="ws-card flex items-start gap-4 p-4">
                      {/* En pantallas angostísimas la miniatura dejaría el título en una columna de pocas letras: se omite (la foto es decorativa). */}
                      {hasPhoto(ctx, item.imageUrl) && <Photo ctx={ctx} src={item.imageUrl} alt="" className="hidden size-16 shrink-0 rounded-[var(--ws-radius)] object-cover @xs:block @sm:size-20" />}
                      <div className="min-w-0">
                        <PostMeta item={item} />
                        <h3 className="ws-h mt-2 text-lg leading-snug">{item.title}</h3>
                      </div>
                    </PostLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }
    case 'grid':
      return (
        <div>
          {heading}
          <ul className={cx('grid gap-5 @2xl:gap-6', gridColumns(items.length, Number(block.columns)))}>
            {items.map((item, index) => (
              <li key={index}>
                <PostLink ctx={ctx} item={item} className="ws-card flex h-full flex-col overflow-hidden text-left">
                  {hasPhoto(ctx, item.imageUrl) && <Photo ctx={ctx} src={item.imageUrl} alt="" className="aspect-[16/10] w-full object-cover" />}
                  <div className="flex grow flex-col p-6">
                    <PostMeta item={item} />
                    <h3 className="ws-h mt-3 text-xl">{item.title}</h3>
                    {item.excerpt && <p className="ws-muted mt-2 leading-relaxed">{item.excerpt}</p>}
                    <ReadMore ctx={ctx} item={item} />
                  </div>
                </PostLink>
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

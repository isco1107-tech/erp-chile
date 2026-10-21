import { ArrowUpRight, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { CONTACT_FORM_FIELDS, PURPOSE_DEFAULTS, publicFormFields } from '@/lib/web-sites/forms';
import { whatsappHref } from '@/lib/web-sites/urls';
import SiteForm from '../../SiteForm';
import { resolveIn, type RenderCtx } from '../context';
import Countdown from '../Countdown';
import { SiteIconView } from '../icons';
import { cx, Fit, hasPhoto, Photo, SectionHeading } from '../parts';
import SiteLink from '../SiteLink';
import { SocialLinks } from '../SiteHeader';
import { ctaCardTone } from '../tone';
import { MapView } from './media';
import { ActionButtons, Avatar, type SectionProps } from './shared';

const ROUNDED = 'rounded-[calc(var(--ws-radius)*1.6)]';

// ---------------------------------------------------------------------------
// Llamado a la acción
// ---------------------------------------------------------------------------

export function CtaSection({ block, ctx, center, tone }: SectionProps<'cta'> & { tone: Parameters<typeof ctaCardTone>[0] }) {
  const Tag = ctx.h1BlockId === block.id ? 'h1' : 'h2';
  const cardTone = `ws-tone-${ctaCardTone(tone)}`;
  const buttons = (alignCenter: boolean, className?: string) => (
    <ActionButtons ctx={ctx} center={alignCenter} primary={{ label: block.buttonLabel, href: block.buttonHref }} secondary={{ label: block.secondaryLabel, href: block.secondaryHref }} className={className} />
  );
  const content = (
    <div className={cx('max-w-2xl', center && 'mx-auto')}>
      {block.title && (
        <Fit>
          <Tag className="ws-h ws-t-2">{block.title}</Tag>
        </Fit>
      )}
      {block.text && <p className="ws-muted mt-4 text-lg leading-relaxed">{block.text}</p>}
      {buttons(center)}
    </div>
  );
  const glow = <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_100%_0%,color-mix(in_srgb,var(--s-fg)_16%,transparent),transparent_70%)]" />;

  switch (block.variant) {
    case 'band':
      return content;
    case 'minimal':
      return (
        <div className={cx('max-w-3xl', center && 'mx-auto')}>
          {block.title && (
            <Fit>
              <Tag className="ws-h ws-t-lg">{block.title}</Tag>
            </Fit>
          )}
          {block.text && <p className="ws-muted mt-5 text-lg leading-relaxed @2xl:text-xl">{block.text}</p>}
          {buttons(center, 'mt-10')}
        </div>
      );
    case 'banner':
      return (
        <div className={cx(cardTone, 'ws-bg relative overflow-hidden px-6 py-7 shadow-xl @2xl:px-10 @2xl:py-8', ROUNDED)}>
          {glow}
          <div className="relative flex flex-col gap-6 @4xl:flex-row @4xl:items-center @4xl:justify-between @4xl:gap-10">
            <div className="min-w-0 @4xl:flex-1">
              {block.title && <Tag className="ws-h text-2xl @2xl:text-3xl">{block.title}</Tag>}
              {block.text && <p className="ws-muted mt-2 leading-relaxed">{block.text}</p>}
            </div>
            {buttons(false, 'mt-0 shrink-0')}
          </div>
        </div>
      );
    case 'split': {
      const photo = hasPhoto(ctx, block.imageUrl);
      return (
        <div className={cx(cardTone, 'ws-bg grid overflow-hidden shadow-xl', ROUNDED, photo && '@3xl:grid-cols-2')}>
          {photo && <Photo ctx={ctx} src={block.imageUrl} alt="" className="aspect-[16/10] h-full w-full object-cover @3xl:aspect-auto" />}
          <div className="flex flex-col justify-center px-6 py-10 @2xl:px-12 @2xl:py-14">
            {block.title && (
              <Fit>
                <Tag className="ws-h ws-t-2">{block.title}</Tag>
              </Fit>
            )}
            {block.text && <p className="ws-muted mt-4 text-lg leading-relaxed">{block.text}</p>}
            {buttons(false)}
          </div>
        </div>
      );
    }
    case 'gradient':
      return (
        <div className={cx('ws-tone-primary ws-bg relative overflow-hidden px-6 py-12 shadow-xl @2xl:px-16 @2xl:py-20', ROUNDED)}>
          <div aria-hidden="true" className="ws-fx ws-fx-gradient" />
          <div className="ws-pattern ws-pat-grid opacity-60" aria-hidden="true" />
          <div className="relative">{content}</div>
        </div>
      );
    case 'card':
      return (
        <div className={cx(cardTone, 'ws-bg relative overflow-hidden px-6 py-12 shadow-xl @2xl:px-16 @2xl:py-16', ROUNDED)}>
          {glow}
          <div className="relative">{content}</div>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Cuenta regresiva
// ---------------------------------------------------------------------------

const DATE_FORMAT = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Santiago' });

export function CountdownSection({ block, ctx, center }: SectionProps<'countdown'>) {
  const target = Date.parse(block.target);
  const valid = Number.isFinite(target);
  return (
    <div className={cx('mx-auto', block.variant === 'big' ? 'max-w-5xl' : 'max-w-3xl')}>
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.text} size={block.variant === 'big' ? 'lg' : 'md'} className="mb-8 max-w-none" />
      {valid && <Countdown targetMs={target} dateLabel={`${DATE_FORMAT.format(new Date(target))} (hora de Chile)`} endedText={block.endedText} variant={block.variant} />}
      <ActionButtons ctx={ctx} center primary={{ label: block.buttonLabel, href: block.buttonHref }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------------

interface ContactInfo {
  key: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
}

function contactInfo(block: SectionProps<'contact'>['block'], ctx: RenderCtx): ContactInfo[] {
  const mail = block.email ? resolveIn(ctx, `mailto:${block.email}`) : null;
  const tel = block.phone ? resolveIn(ctx, `tel:${block.phone}`) : null;
  const linkClass = 'underline decoration-1 underline-offset-4 hover:[color:var(--s-mark)]';
  const out: ContactInfo[] = [];
  if (mail)
    out.push({
      key: 'mail',
      icon: <Mail className="size-5" aria-hidden="true" />,
      label: 'Correo',
      value: (
        <SiteLink ctx={ctx} link={mail} className={linkClass}>
          {block.email}
        </SiteLink>
      ),
    });
  if (tel)
    out.push({
      key: 'tel',
      icon: <Phone className="size-5" aria-hidden="true" />,
      label: 'Teléfono',
      value: (
        <SiteLink ctx={ctx} link={tel} className={linkClass}>
          {block.phone}
        </SiteLink>
      ),
    });
  if (block.address) out.push({ key: 'address', icon: <MapPin className="size-5" aria-hidden="true" />, label: 'Dirección', value: <span className="whitespace-pre-line">{block.address}</span> });
  if (block.hours) out.push({ key: 'hours', icon: <Clock className="size-5" aria-hidden="true" />, label: 'Horario', value: <span className="whitespace-pre-line">{block.hours}</span> });
  return out;
}

function ContactRow({ info, large }: { info: ContactInfo; large?: boolean }) {
  return (
    <li className="flex items-start gap-4">
      <span className="ws-icon-tile size-11 shrink-0">{info.icon}</span>
      <span className="min-w-0 pt-0.5">
        <span className="ws-muted block text-xs font-semibold tracking-wider uppercase">{info.label}</span>
        <span className={cx('block break-words', large ? 'text-xl @2xl:text-2xl' : 'text-lg')}>{info.value}</span>
      </span>
    </li>
  );
}

const CONTACT_PUBLIC_FIELDS = publicFormFields(CONTACT_FORM_FIELDS);

function FormCard({ ctx, blockId, flat }: { ctx: RenderCtx; blockId: string; flat?: boolean }) {
  return (
    <div className={cx('ws-tone-default ws-bg min-w-0 text-left', flat ? 'border-t border-[color:var(--ws-border)] pt-8' : 'rounded-[calc(var(--ws-radius)*1.4)] border border-[color:var(--ws-border)] p-6 shadow-xl @2xl:p-8')}>
      <h3 className="ws-h mb-5 text-xl">Envíanos un mensaje</h3>
      <SiteForm
        slug={ctx.slug}
        preview={ctx.preview}
        formId={blockId}
        fields={CONTACT_PUBLIC_FIELDS}
        submitLabel={PURPOSE_DEFAULTS.contact.submitLabel}
        successTitle={PURPOSE_DEFAULTS.contact.successTitle}
        successText="Te responderemos lo antes posible al correo que dejaste."
        consentCheckbox={false}
      />
    </div>
  );
}

export function ContactSection({ block, ctx, center }: SectionProps<'contact'>) {
  const info = contactInfo(block, ctx);
  const wa = resolveIn(ctx, whatsappHref(block.whatsapp));
  const hasInfo = info.length > 0 || Boolean(wa);
  const showMap = block.showMap && block.address;
  const waButton = (className?: string) =>
    wa ? (
      <SiteLink ctx={ctx} link={wa} className={cx('ws-btn ws-btn-main', className)}>
        <MessageCircle className="size-5" aria-hidden="true" /> Escribir por WhatsApp
      </SiteLink>
    ) : null;
  const map = showMap ? (
    <div className="mt-12 text-left">
      <MapView ctx={ctx} address={block.address} height="md" />
    </div>
  ) : null;

  switch (block.variant) {
    case 'centered':
      return (
        <div className="mx-auto max-w-3xl">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.text} />
          {hasInfo && (
            <div className="mb-10 flex flex-wrap justify-center gap-3">
              {info.map((entry) => (
                <span key={entry.key} className="ws-card inline-flex max-w-full items-center gap-2.5 rounded-full px-4 py-2 text-left text-sm">
                  <span className="shrink-0 [color:var(--s-mark)]">{entry.icon}</span>
                  <span className="min-w-0 break-words whitespace-pre-line">{entry.value}</span>
                </span>
              ))}
              {waButton('ws-btn-sm')}
            </div>
          )}
          {block.showForm && (
            <div className="mx-auto max-w-xl">
              <FormCard ctx={ctx} blockId={block.id} />
            </div>
          )}
          {map}
        </div>
      );
    case 'cards':
      return (
        <div>
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.text} />
          {info.length > 0 && (
            <ul className={cx('grid gap-4 @md:grid-cols-2', info.length >= 4 ? '@4xl:grid-cols-4' : info.length === 3 ? '@4xl:grid-cols-3' : '')}>
              {info.map((entry) => (
                <li key={entry.key} className="ws-card p-6 text-left">
                  <span className="ws-icon-tile mb-4">{entry.icon}</span>
                  <p className="ws-muted text-xs font-semibold tracking-wider uppercase">{entry.label}</p>
                  <p className="mt-1 text-lg break-words">{entry.value}</p>
                </li>
              ))}
            </ul>
          )}
          {waButton(cx(info.length > 0 && 'mt-8'))}
          {(block.showForm || showMap) && (
            <div className={cx('mt-12 grid gap-10', block.showForm && showMap && '@3xl:grid-cols-2')}>
              {block.showForm && <FormCard ctx={ctx} blockId={block.id} />}
              {showMap && (
                <div className="text-left">
                  <MapView ctx={ctx} address={block.address} height="md" />
                </div>
              )}
            </div>
          )}
        </div>
      );
    case 'minimal':
      return (
        <div>
          <div className={cx('grid gap-12 @3xl:gap-16', block.showForm && '@3xl:grid-cols-2')}>
            <div className="text-left">
              <SectionHeading ctx={ctx} blockId={block.id} center={false} title={block.heading} intro={block.text} size="lg" className="mb-10" />
              {info.length > 0 && (
                <ul className="space-y-6">
                  {info.map((entry) => (
                    <ContactRow key={entry.key} info={entry} large />
                  ))}
                </ul>
              )}
              {waButton(cx(info.length > 0 && 'mt-10'))}
            </div>
            {block.showForm && <FormCard ctx={ctx} blockId={block.id} flat />}
          </div>
          {map}
        </div>
      );
    case 'split':
      return (
        <div>
          <div className={cx('grid gap-10 @3xl:gap-16', block.showForm && hasInfo && '@3xl:grid-cols-2', !hasInfo && block.showForm && 'mx-auto max-w-xl')}>
            {(hasInfo || block.heading || block.text) && (
              <div className="text-left">
                <SectionHeading ctx={ctx} blockId={block.id} center={false} title={block.heading} intro={block.text} className="mb-8 @2xl:mb-8" />
                {info.length > 0 && (
                  <ul className="space-y-5">
                    {info.map((entry) => (
                      <ContactRow key={entry.key} info={entry} />
                    ))}
                  </ul>
                )}
                {waButton(cx(info.length > 0 && 'mt-8'))}
              </div>
            )}
            {block.showForm && <FormCard ctx={ctx} blockId={block.id} />}
          </div>
          {map}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Enlaces (link en bio)
// ---------------------------------------------------------------------------

export function LinksSection({ block, ctx }: SectionProps<'links'>) {
  const Tag = ctx.h1BlockId === block.id ? 'h1' : 'h2';
  const links = block.items.flatMap((item) => {
    const link = item.label ? resolveIn(ctx, item.href) : null;
    return link || (ctx.placeholders && item.label) ? [{ item, link }] : [];
  });
  const grid = block.variant === 'grid';
  return (
    <div className={cx('mx-auto text-center', grid ? 'max-w-2xl' : 'max-w-md')}>
      {hasPhoto(ctx, block.imageUrl) ? (
        <Photo ctx={ctx} src={block.imageUrl} alt="" eager className="mx-auto size-28 rounded-full object-cover shadow-lg ring-4 ring-[color:var(--s-card)]" />
      ) : block.title ? (
        <Avatar name={block.title} className="mx-auto !size-24 text-3xl" />
      ) : null}
      {block.title && <Tag className="ws-h mt-5 text-2xl @2xl:text-3xl">{block.title}</Tag>}
      {block.text && <p className="ws-muted mx-auto mt-3 max-w-sm leading-relaxed">{block.text}</p>}
      {block.showSocial && <SocialLinks ctx={ctx} className="mt-4 justify-center" />}
      <ul className={cx('mt-8 grid gap-3', grid && '@md:grid-cols-2')}>
        {links.map(({ item, link }, index) => {
          const inner = grid ? (
            <>
              <span className="ws-icon-tile size-11 shrink-0">
                <SiteIconView name={item.icon || 'sparkles'} className="size-5" />
              </span>
              <span className="min-w-0 flex-1 text-left font-semibold">{item.label}</span>
              <ArrowUpRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />
            </>
          ) : (
            <>
              {item.icon && <SiteIconView name={item.icon} className="size-5 shrink-0" />}
              <span className="min-w-0">{item.label}</span>
            </>
          );
          const className = grid ? 'ws-card ws-card-hover flex items-center gap-4 p-4' : 'ws-btn ws-btn-main w-full !py-4';
          return (
            <li key={index}>
              {link ? (
                <SiteLink ctx={ctx} link={link} className={className}>
                  {inner}
                </SiteLink>
              ) : (
                <span className={className}>{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

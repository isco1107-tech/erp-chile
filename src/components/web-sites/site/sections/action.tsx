import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { whatsappHref } from '@/lib/web-sites/urls';
import ContactForm from '../../ContactForm';
import { resolveIn } from '../context';
import Countdown from '../Countdown';
import { cx, SectionHeading } from '../parts';
import SiteLink from '../SiteLink';
import { ctaCardTone } from '../tone';
import { MapView } from './media';
import { ActionButtons, type SectionProps } from './shared';

export function CtaSection({ block, ctx, center, tone }: SectionProps<'cta'> & { tone: Parameters<typeof ctaCardTone>[0] }) {
  const Tag = ctx.h1BlockId === block.id ? 'h1' : 'h2';
  const content = (
    <div className={cx('max-w-2xl', center && 'mx-auto')}>
      {block.title && <Tag className="ws-h text-3xl @2xl:text-4xl">{block.title}</Tag>}
      {block.text && <p className="ws-muted mt-4 text-lg leading-relaxed">{block.text}</p>}
      <ActionButtons ctx={ctx} center={center} primary={{ label: block.buttonLabel, href: block.buttonHref }} secondary={{ label: block.secondaryLabel, href: block.secondaryHref }} />
    </div>
  );
  if (block.variant === 'band') return content;
  return (
    <div className={cx(`ws-tone-${ctaCardTone(tone)}`, 'ws-bg relative overflow-hidden rounded-[calc(var(--ws-radius)*1.6)] px-6 py-12 shadow-xl @2xl:px-16 @2xl:py-16')}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_100%_0%,color-mix(in_srgb,var(--s-fg)_16%,transparent),transparent_70%)]" />
      <div className="relative">{content}</div>
    </div>
  );
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-CL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Santiago' });

export function CountdownSection({ block, ctx, center }: SectionProps<'countdown'>) {
  const target = Date.parse(block.target);
  const valid = Number.isFinite(target);
  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.text} className="mb-8 max-w-none" />
      {valid && <Countdown targetMs={target} dateLabel={`${DATE_FORMAT.format(new Date(target))} (hora de Chile)`} endedText={block.endedText} />}
      <ActionButtons ctx={ctx} center primary={{ label: block.buttonLabel, href: block.buttonHref }} />
    </div>
  );
}

function ContactRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span className="ws-icon-tile size-11 shrink-0">{icon}</span>
      <span className="min-w-0 pt-0.5">
        <span className="ws-muted block text-xs font-semibold tracking-wider uppercase">{label}</span>
        <span className="block text-lg break-words">{children}</span>
      </span>
    </li>
  );
}

export function ContactSection({ block, ctx }: SectionProps<'contact'>) {
  const mail = block.email ? resolveIn(ctx, `mailto:${block.email}`) : null;
  const tel = block.phone ? resolveIn(ctx, `tel:${block.phone}`) : null;
  const wa = resolveIn(ctx, whatsappHref(block.whatsapp));
  const hasInfo = Boolean(mail || tel || wa || block.address || block.hours);
  const linkClass = 'underline decoration-1 underline-offset-4 hover:[color:var(--s-mark)]';
  const showMap = block.showMap && block.address;
  return (
    <div>
      <div className={cx('grid gap-10 @3xl:gap-16', block.showForm && hasInfo && '@3xl:grid-cols-2', !hasInfo && block.showForm && 'mx-auto max-w-xl')}>
        {(hasInfo || block.heading || block.text) && (
          <div className="text-left">
            <SectionHeading ctx={ctx} blockId={block.id} center={false} title={block.heading} intro={block.text} className="mb-8 @2xl:mb-8" />
            {hasInfo && (
              <ul className="space-y-5">
                {mail && (
                  <ContactRow icon={<Mail className="size-5" aria-hidden="true" />} label="Correo">
                    <SiteLink ctx={ctx} link={mail} className={linkClass}>
                      {block.email}
                    </SiteLink>
                  </ContactRow>
                )}
                {tel && (
                  <ContactRow icon={<Phone className="size-5" aria-hidden="true" />} label="Teléfono">
                    <SiteLink ctx={ctx} link={tel} className={linkClass}>
                      {block.phone}
                    </SiteLink>
                  </ContactRow>
                )}
                {block.address && (
                  <ContactRow icon={<MapPin className="size-5" aria-hidden="true" />} label="Dirección">
                    <span className="whitespace-pre-line">{block.address}</span>
                  </ContactRow>
                )}
                {block.hours && (
                  <ContactRow icon={<Clock className="size-5" aria-hidden="true" />} label="Horario">
                    <span className="whitespace-pre-line">{block.hours}</span>
                  </ContactRow>
                )}
              </ul>
            )}
            {wa && (
              <SiteLink ctx={ctx} link={wa} className={cx('ws-btn ws-btn-main', hasInfo && 'mt-8')}>
                <MessageCircle className="size-5" aria-hidden="true" /> Escribir por WhatsApp
              </SiteLink>
            )}
          </div>
        )}
        {block.showForm && (
          <div className="ws-tone-default ws-bg rounded-[calc(var(--ws-radius)*1.4)] border border-[color:var(--ws-border)] p-6 text-left shadow-xl @2xl:p-8">
            <h3 className="ws-h mb-5 text-xl">Envíanos un mensaje</h3>
            <ContactForm slug={ctx.slug} preview={ctx.preview} />
          </div>
        )}
      </div>
      {showMap && (
        <div className="mt-12 text-left">
          <MapView ctx={ctx} address={block.address} height="md" />
        </div>
      )}
    </div>
  );
}

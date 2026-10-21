import { Check } from 'lucide-react';
import { needsConsentCheckbox, PURPOSE_DEFAULTS, publicFormFields } from '@/lib/web-sites/forms';
import SiteForm from '../../SiteForm';
import { cx, hasPhoto, Photo, SectionHeading } from '../parts';
import type { SectionProps } from './shared';

// ---------------------------------------------------------------------------
// Formulario (contacto, cotización, inscripción, reserva…)
// ---------------------------------------------------------------------------

const ROUNDED = 'rounded-[calc(var(--ws-radius)*1.4)]';

function Highlights({ items, center }: { items: string[]; center?: boolean }) {
  if (items.length === 0) return null;
  return (
    <ul className={cx('grid gap-3', center && 'mx-auto w-fit max-w-full text-left')}>
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-3">
          <span className="ws-icon-tile mt-0.5 size-7 shrink-0 rounded-full">
            <Check className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 pt-0.5">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function FormSection({ block, ctx, center }: SectionProps<'form'>) {
  const defaults = PURPOSE_DEFAULTS[block.purpose];
  const highlights = block.highlights.map((item) => item.trim()).filter(Boolean);
  const form = (
    <SiteForm
      slug={ctx.slug}
      preview={ctx.preview}
      formId={block.id}
      fields={publicFormFields(block.fields)}
      submitLabel={block.submitLabel.trim() || defaults.submitLabel}
      successTitle={block.successTitle.trim() || defaults.successTitle}
      successText={block.successText.trim() || (block.successTitle.trim() ? '' : defaults.successText)}
      consentCheckbox={needsConsentCheckbox(block)}
      steps={block.variant === 'steps'}
    />
  );
  const card = (className?: string) => <div className={cx('ws-tone-default ws-bg min-w-0 border border-[color:var(--ws-border)] p-5 text-left shadow-xl @2xl:p-8', ROUNDED, className)}>{form}</div>;

  switch (block.variant) {
    case 'card':
    case 'steps':
      return (
        <div className="mx-auto max-w-2xl">
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} className="mb-8 @2xl:mb-10" />
          {highlights.length > 0 && (
            <div className="mb-8">
              <Highlights items={highlights} center={center} />
            </div>
          )}
          {card()}
        </div>
      );
    case 'minimal':
      return (
        <div className={cx('max-w-2xl', center && 'mx-auto')}>
          <SectionHeading ctx={ctx} blockId={block.id} center={center} title={block.heading} intro={block.intro} className="mb-8" />
          {highlights.length > 0 && (
            <div className="mb-8">
              <Highlights items={highlights} center={center} />
            </div>
          )}
          <div className="text-left">{form}</div>
        </div>
      );
    case 'split':
      return (
        <div className="grid gap-10 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @3xl:gap-14">
          <div className="min-w-0 text-left">
            <SectionHeading ctx={ctx} blockId={block.id} center={false} title={block.heading} intro={block.intro} className="mb-8" />
            <Highlights items={highlights} />
          </div>
          {card()}
        </div>
      );
    case 'photo': {
      const photo = hasPhoto(ctx, block.imageUrl);
      return (
        <div className={cx('grid gap-10 @3xl:gap-14', photo && '@3xl:grid-cols-2')}>
          {photo && (
            <div className="min-w-0">
              <Photo ctx={ctx} src={block.imageUrl} alt="" className={cx('aspect-[4/3] w-full object-cover shadow-xl @3xl:aspect-auto @3xl:h-full @3xl:min-h-[28rem]', ROUNDED)} />
            </div>
          )}
          <div className={cx('min-w-0 text-left', !photo && 'mx-auto w-full max-w-2xl')}>
            <SectionHeading ctx={ctx} blockId={block.id} center={false} title={block.heading} intro={block.intro} className="mb-6" />
            {highlights.length > 0 && (
              <div className="mb-8">
                <Highlights items={highlights} />
              </div>
            )}
            {card()}
          </div>
        </div>
      );
    }
  }
}

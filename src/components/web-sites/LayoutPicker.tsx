'use client';

import { useDeferredValue, useId, useMemo } from 'react';
import { ChevronDown, LayoutTemplate } from 'lucide-react';
import { isBlockEmpty, type WebSiteBlock } from '@/lib/web-sites/blocks';
import { sampleBlock } from '@/lib/web-sites/section-samples';
import type { SiteDocument } from '@/lib/web-sites/site';
import type { WebSiteTheme } from '@/lib/web-sites/theme';
import { BLOCK_LAYOUTS, layoutLabel, layoutsOf, withVariant } from '@/lib/web-sites/variants';
import { cn } from '@/lib/utils';
import { SectionThumbnail, ThumbnailStyles } from './SectionThumbnail';

interface LayoutPickerProps {
  block: WebSiteBlock;
  theme: WebSiteTheme;
  document: SiteDocument | null;
  disabled: boolean;
  onChange: (block: WebSiteBlock) => void;
}

/**
 * "Diseño de la sección": cada diseño disponible dibujado con el contenido
 * real de la sección y los colores del sitio (si la sección está vacía, con
 * el contenido de muestra), como los selectores de diseño de los creadores
 * líderes. Cambiar de diseño no toca el contenido. Accesible como grupo de
 * radios; las miniaturas son decorativas.
 */
export function LayoutPicker({ block, theme, document, disabled, onChange }: LayoutPickerProps) {
  const name = useId();
  const options = layoutsOf(block.type);
  // Las miniaturas se redibujan sin frenar lo que se escribe.
  const deferred = useDeferredValue(block);
  const previews = useMemo(() => {
    const source = isBlockEmpty(deferred) ? { ...sampleBlock(deferred.type), id: deferred.id, style: deferred.style } : deferred;
    return new Map(layoutsOf(source.type).map((option) => [option.value, withVariant(source, option.value)]));
  }, [deferred]);
  if (options.length < 2) return null;

  return (
    <details className="group rounded-lg border border-border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <LayoutTemplate className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Diseño: {layoutLabel(block)}</span>
            <span className="block truncate text-xs text-muted-foreground">{options.length} diseños disponibles. El contenido se mantiene al cambiar.</span>
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <fieldset className="space-y-2 border-t border-border p-3">
        <legend className="sr-only">Diseño de la sección</legend>
        <p className="text-xs text-muted-foreground">{BLOCK_LAYOUTS[block.type].hint}</p>
        <ThumbnailStyles />
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => {
            const selected = option.value === block.variant;
            return (
              // La miniatura tiene enlaces y botones (inertes) del sitio: no va dentro del <label>; la etiqueta cubre la tarjeta con ::after.
              <div
                key={option.value}
                className={cn(
                  'relative flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  selected ? 'border-ring bg-accent' : 'border-border hover:bg-muted',
                  disabled && 'opacity-60'
                )}
              >
                <SectionThumbnail block={previews.get(option.value) ?? block} theme={theme} document={document} height={110} />
                <label className={cn('text-sm font-medium after:absolute after:inset-0 after:rounded-lg', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
                  <input type="radio" className="sr-only" name={name} value={option.value} checked={selected} disabled={disabled} onChange={() => onChange(withVariant(block, option.value))} />
                  {option.label}
                </label>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
            );
          })}
        </div>
      </fieldset>
    </details>
  );
}

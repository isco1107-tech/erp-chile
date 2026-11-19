'use client';

import type { CSSProperties } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { PAGEANT_FONT_CLASSES } from '@/components/public/pageant/fonts';
import { SITE_FONT_CLASSES } from '@/components/web-sites/site-fonts';
import {
  PAGEANT_FONT_ROLES,
  PAGEANT_TEXT_BLOCKS,
  effectiveFont,
  fontsFor,
  pageantFontInfo,
  type PageantFontKey,
  type PageantTypography,
  type PageantTypographyKey,
} from '@/lib/events/pageant-typography';
import { cn } from '@/lib/utils';

/** Bloques que en el sitio van en cursiva: la muestra también. */
const ITALIC: ReadonlySet<PageantTypographyKey> = new Set(['serif', 'tagline', 'titleAccent', 'quotes']);

function sample(key: PageantTypographyKey, texts: { name: string; tagline: string; description: string }): string {
  const firstWords = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text);
  switch (key) {
    case 'display':
    case 'heroTitle':
    case 'sectionTitles':
    case 'brand':
      return texts.name || 'Nombre del certamen';
    case 'heroCall':
      return 'Postula y sé la próxima reina';
    case 'serif':
    case 'tagline':
      return firstWords(texts.tagline, 70) || 'La belleza con propósito vuelve a la ciudad';
    case 'kickers':
      return 'EL CERTAMEN';
    case 'titleAccent':
      return texts.name.split(/\s+/).filter(Boolean).at(-1) ?? 'Temuco';
    case 'lead':
    case 'prose':
    case 'sans':
      return firstWords(texts.description, 90) || 'Historia del certamen, qué se busca en una reina y la causa que apoya.';
    case 'dropCap':
      return (texts.description.trim()[0] ?? 'L').toUpperCase();
    case 'names':
      return 'Valentina Rojas · Constanza Rey';
    case 'cardTitles':
      return 'Paquete Diamond · ¿Quiénes pueden postular?';
    case 'quotes':
      return 'Noviembre · @fiestadelaprimavera';
    case 'numbers':
      return '12 · 2026 · $450.000 · 1.280 votos';
  }
}

function FontRow({
  id,
  label,
  hint,
  value,
  inheritLabel,
  options,
  previewFont,
  previewText,
  italic,
  large,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: PageantFontKey | undefined;
  inheritLabel: string;
  options: readonly PageantFontKey[];
  previewFont: PageantFontKey;
  previewText: string;
  italic: boolean;
  large: boolean;
  disabled: boolean;
  onChange: (font: PageantFontKey | undefined) => void;
}) {
  const style: CSSProperties = { fontFamily: pageantFontInfo(previewFont).css, fontStyle: italic ? 'italic' : 'normal' };
  return (
    <li className="grid grid-cols-1 gap-2 py-3 @md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] @md:items-start">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <p className={cn('mt-1.5 truncate text-foreground', large ? 'text-2xl leading-tight' : 'text-base')} style={style} aria-hidden="true" title={previewText}>
          {previewText}
        </p>
      </div>
      <select
        id={id}
        className={nativeSelectClass}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value ? (event.target.value as PageantFontKey) : undefined)}
      >
        <option value="">{inheritLabel}</option>
        {options.map((font) => (
          <option key={font} value={font}>
            {pageantFontInfo(font).label}
          </option>
        ))}
      </select>
    </li>
  );
}

/**
 * Tipografía del micrositio: tres familias para todo el sitio y una por cada
 * bloque de texto. «Igual que…» deja el bloque con su familia general, así un
 * cambio general se ve en todos los bloques que no eligieron otra.
 */
export function TypographyPicker({
  value,
  onChange,
  disabled,
  texts,
}: {
  value: PageantTypography;
  onChange: (next: PageantTypography) => void;
  disabled: boolean;
  texts: { name: string; tagline: string; description: string };
}) {
  const set = (key: PageantTypographyKey, font: PageantFontKey | undefined) => {
    const next = { ...value };
    if (font) next[key] = font;
    else delete next[key];
    onChange(next);
  };
  const customBlocks = PAGEANT_TEXT_BLOCKS.filter((block) => value[block.key]).length;
  const hasChanges = Object.keys(value).length > 0;

  return (
    <section className={cn('@container space-y-4 rounded-lg border border-border bg-card p-5 shadow-card', PAGEANT_FONT_CLASSES, SITE_FONT_CLASSES)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tipografía</h2>
          <p className="text-xs text-muted-foreground">Elige la letra de todo el sitio y, si quieres, una distinta para cada bloque de texto. Se publica al guardar.</p>
        </div>
        {hasChanges && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange({})}>
            <RotateCcw aria-hidden="true" />
            Volver a la de fábrica
          </Button>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium">Todo el sitio</h3>
        <ul className="divide-y divide-border">
          {PAGEANT_FONT_ROLES.map((role) => (
            <FontRow
              key={role.key}
              id={`typo-${role.key}`}
              label={role.label}
              hint={role.hint}
              value={value[role.key]}
              inheritLabel={`De fábrica: ${pageantFontInfo(role.defaultFont).label}`}
              options={fontsFor(role.key)}
              previewFont={effectiveFont(value, role.key)}
              previewText={sample(role.key, texts)}
              italic={ITALIC.has(role.key)}
              large={role.key === 'display'}
              disabled={disabled}
              onChange={(font) => set(role.key, font)}
            />
          ))}
        </ul>
      </div>

      <details className="group rounded-md border border-border px-4" open={customBlocks > 0}>
        <summary className="cursor-pointer py-3 text-sm font-medium">
          Por bloque de texto
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {customBlocks > 0 ? `${customBlocks} con letra propia` : `${PAGEANT_TEXT_BLOCKS.length} bloques, todos con su familia general`}
          </span>
        </summary>
        <ul className="divide-y divide-border border-t border-border">
          {PAGEANT_TEXT_BLOCKS.map((block) => {
            const inherited = PAGEANT_FONT_ROLES.find((role) => role.key === block.inherits);
            return (
              <FontRow
                key={block.key}
                id={`typo-${block.key}`}
                label={block.label}
                hint={block.hint}
                value={value[block.key]}
                inheritLabel={`Igual que «${inherited?.label ?? 'el sitio'}»: ${pageantFontInfo(effectiveFont(value, block.inherits)).label}`}
                options={fontsFor(block.key)}
                previewFont={effectiveFont(value, block.key)}
                previewText={sample(block.key, texts)}
                italic={ITALIC.has(block.key)}
                large={block.key === 'heroTitle' || block.key === 'sectionTitles' || block.key === 'dropCap'}
                disabled={disabled}
                onChange={(font) => set(block.key, font)}
              />
            );
          })}
        </ul>
      </details>
    </section>
  );
}

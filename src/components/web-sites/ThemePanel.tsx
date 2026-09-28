'use client';

import { useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FONT_OPTIONS, FONT_STACKS, HEX_COLOR_RE, RADIUS_OPTIONS, RADIUS_VALUES, themeProblems, type WebSiteTheme } from '@/lib/web-sites/theme';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SwitchRow, TextField } from './fields';

type ColorKey = 'primary' | 'accent' | 'background' | 'text';

const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'primary', label: 'Color principal', hint: 'Portada, franjas y barra superior.' },
  { key: 'accent', label: 'Color de acento', hint: 'Botones, títulos destacados y detalles.' },
  { key: 'background', label: 'Fondo de la página', hint: 'Detrás de los textos.' },
  { key: 'text', label: 'Color del texto', hint: 'Párrafos y títulos. Debe contrastar con el fondo.' },
];

/** `#abc123`, o `abc123` sin numeral (se perdona), o `null` si no es un color completo. */
function normalizeHex(raw: string): string | null {
  const value = raw.trim();
  const withHash = /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}` : value;
  return HEX_COLOR_RE.test(withHash) ? withHash.toLowerCase() : null;
}

function ColorField({ label, hint, value, disabled, onChange }: { label: string; hint: string; value: string; disabled: boolean; onChange: (hex: string) => void }) {
  const id = useId();
  // Mientras se escribe, el texto puede estar a medias: solo se guarda al completar un color válido.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const invalid = draft !== null && normalizeHex(draft) === null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-hex`}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value.toLowerCase()}
          disabled={disabled}
          aria-label={`${label}: elegir con el selector de color`}
          onChange={(event) => {
            setDraft(null);
            onChange(event.target.value);
          }}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input
          id={`${id}-hex`}
          value={shown}
          maxLength={7}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`}
          className="font-mono uppercase"
          onChange={(event) => {
            const text = event.target.value;
            const hex = normalizeHex(text);
            if (hex) {
              setDraft(null);
              onChange(hex);
            } else {
              setDraft(text);
            }
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      {invalid ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          Escribe el color con 6 dígitos, por ejemplo #B8963E.
        </p>
      ) : null}
    </div>
  );
}

interface ThemePanelProps {
  theme: WebSiteTheme;
  onChange: (patch: Partial<WebSiteTheme>) => void;
  disabled: boolean;
}

/** Colores, tipografía, redondeo, barra superior y pie del sitio (solo modo guiado). */
export function ThemePanel({ theme, onChange, disabled }: ThemePanelProps) {
  const problems = themeProblems(theme);
  return (
    <div className="space-y-6">
      {problems.length > 0 ? (
        <div role="status" className="space-y-1.5 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden="true" /> Ojo con la legibilidad
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section aria-label="Colores" className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Colores</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {COLOR_FIELDS.map((field) => (
            <ColorField key={field.key} label={field.label} hint={field.hint} value={theme[field.key]} disabled={disabled} onChange={(hex) => onChange({ [field.key]: hex })} />
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Tipografía</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {FONT_OPTIONS.map((font) => {
              const stack = FONT_STACKS[font];
              return (
                <label
                  key={font}
                  className={cn(
                    'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                    theme.font === font ? 'border-ring bg-accent' : 'border-border hover:bg-muted',
                    disabled && 'cursor-not-allowed opacity-60'
                  )}
                >
                  <input type="radio" name="theme-font" className="sr-only" value={font} checked={theme.font === font} disabled={disabled} onChange={() => onChange({ font })} />
                  <span className="text-2xl leading-none" style={{ fontFamily: stack.css }} aria-hidden="true">
                    Aa
                  </span>
                  <span className="text-sm font-medium">{stack.label}</span>
                  <span className="text-xs text-muted-foreground">{stack.description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Bordes de botones y tarjetas</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {RADIUS_OPTIONS.map((radius) => (
              <label
                key={radius}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  theme.radius === radius ? 'border-ring bg-accent' : 'border-border hover:bg-muted',
                  disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <input type="radio" name="theme-radius" className="sr-only" value={radius} checked={theme.radius === radius} disabled={disabled} onChange={() => onChange({ radius })} />
                <span className="size-9 shrink-0 border-2 border-foreground/60 bg-muted" style={{ borderRadius: RADIUS_VALUES[radius].px }} aria-hidden="true" />
                <span className="text-sm font-medium">{RADIUS_VALUES[radius].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-label="Barra superior y pie" className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold">Barra superior y pie</h2>
        <SwitchRow label="Mostrar barra superior" description="Con el logo y enlaces a cada sección que tenga título. Recomendada si tu sitio tiene varias secciones." checked={theme.showNav} onChange={(showNav) => onChange({ showNav })} disabled={disabled} />
        <TextField label="Texto del pie de página" value={theme.footerText} onChange={(footerText) => onChange({ footerText })} max={200} disabled={disabled} placeholder="Ej.: © 2026 Mi Empresa SpA · Santiago, Chile" hint="Opcional. Aparece al final de todas las páginas." />
      </section>
    </div>
  );
}

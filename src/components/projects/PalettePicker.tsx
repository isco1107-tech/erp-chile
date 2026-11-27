'use client';

import { useMemo, useState } from 'react';
import { Palette, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { detectCoverPaletteAction } from '@/modules/projects/actions/projects.actions';
import {
  DEFAULT_MANUAL_PALETTE,
  PALETTE_ROLES,
  PALETTE_ROLE_INFO,
  derivePaletteTokens,
  withPaletteColor,
  type PageantPalette,
} from '@/lib/events/pageant-palette';
import { cn } from '@/lib/utils';

/**
 * «Colores del sitio»: los tres colores con los que se pinta el micrositio del
 * certamen. Se detectan solos de la portada (`detectCoverPaletteAction` y la
 * subida de la portada) y se pueden ajustar a mano. Lo comparten el formulario
 * de «Sitio público» y el editor visual: los dos editan el mismo borrador.
 *
 * La vista previa usa `derivePaletteTokens`, la MISMA función que arma la hoja
 * de estilos del sitio publicado: lo que se ve acá es lo que se publica.
 */

function PalettePreview({ palette }: { palette: PageantPalette }) {
  const { main, deep } = useMemo(() => derivePaletteTokens(palette), [palette]);
  const band = (vars: Record<string, string>) => `radial-gradient(90% 140% at 90% 0%, ${vars['--night-3']}, ${vars['--night']} 70%)`;
  return (
    <div className="overflow-hidden rounded-lg border border-border text-left" aria-hidden="true">
      <div className="space-y-2 p-4" style={{ background: band(main) }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: main['--a'] }}>
          Convocatoria 2026
        </p>
        <p className="text-xl leading-tight" style={{ color: '#f5f1e8' }}>
          Sé la próxima <span style={{ color: main['--a'], fontStyle: 'italic' }}>reina</span>
        </p>
        <span
          className="inline-block rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ background: `linear-gradient(120deg, ${main['--a-bright']}, ${main['--a']} 45%, ${main['--a-mid']})`, color: main['--ink'] }}
        >
          Postular
        </span>
      </div>
      <div className="flex items-center gap-3 p-3" style={{ background: band(deep), borderTop: `1px solid ${main['--a-mid']}` }}>
        <span className="size-3 shrink-0 rounded-full" style={{ background: `rgb(${main['--glow-rgb']})`, boxShadow: `0 0 14px rgb(${main['--glow-rgb']})` }} />
        <p className="text-xs" style={{ color: '#f5f1e8' }}>
          Sección alterna con el color de destaque
        </p>
      </div>
      <div className="p-3" style={{ background: main['--paper'] }}>
        <p className="text-xs" style={{ color: main['--ink'] }}>
          Texto sobre papel claro <span style={{ color: main['--copihue'] }}>· un aviso de error</span>
        </p>
      </div>
    </div>
  );
}

export function PalettePicker({
  projectId,
  value,
  onChange,
  coverImageUrl,
  disabled,
}: {
  projectId: string;
  value: PageantPalette | null;
  onChange: (palette: PageantPalette | null) => void;
  /** La portada que hay en pantalla (guardada o recién subida): de ella salen los colores. */
  coverImageUrl: string;
  disabled?: boolean;
}) {
  const [detecting, setDetecting] = useState(false);

  async function detect() {
    if (!coverImageUrl) return;
    setDetecting(true);
    try {
      const result = await detectCoverPaletteAction(projectId, coverImageUrl);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChange({ ...result.data, source: 'portada' });
      toast.success('Colores detectados de la portada: revisa cómo queda y guarda los cambios');
    } finally {
      setDetecting(false);
    }
  }

  return (
    <section className="@container space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Palette className="size-4" aria-hidden="true" />
            Colores del sitio
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Tres colores de tu portada pintan todo el sitio: el fondo, los títulos y botones, y los detalles. Se detectan solos al subir la portada y puedes ajustarlos.
          </p>
        </div>
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={detecting || !coverImageUrl} onClick={() => void detect()} title={coverImageUrl ? undefined : 'Sube una portada primero'}>
              <Sparkles aria-hidden="true" />
              {detecting ? 'Detectando…' : 'Detectar desde la portada'}
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                <RotateCcw aria-hidden="true" />
                Usar el acento prediseñado
              </Button>
            )}
          </div>
        )}
      </div>

      {value ? (
        <div className="grid gap-4 @xl:grid-cols-2">
          <div className="space-y-3">
            {PALETTE_ROLES.map((role) => {
              const info = PALETTE_ROLE_INFO[role];
              const id = `palette-${role}`;
              return (
                <div key={role} className="flex items-start gap-3">
                  <input
                    id={id}
                    type="color"
                    value={value[role]}
                    disabled={disabled}
                    onChange={(event) => onChange(withPaletteColor(value, role, event.target.value))}
                    className={cn('size-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5', disabled && 'cursor-not-allowed opacity-60')}
                    aria-label={`${info.label}: ${value[role]}`}
                  />
                  <div className="min-w-0">
                    <Label htmlFor={id} className="flex items-center gap-2">
                      {info.label}
                      <span className="font-mono text-xs font-normal uppercase text-muted-foreground">{value[role]}</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              {value.source === 'manual' ? 'Ajustados a mano: una portada nueva no los cambia.' : 'Detectados de la portada.'} Las secciones del estudio visual siguen los mismos colores y el texto siempre se lee: el fondo se oscurece y el acento se aclara si hace falta.
            </p>
          </div>
          <PalettePreview palette={value} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <p className="min-w-0 flex-1">Sin colores propios: el sitio usa el color de acento prediseñado. Detecta los de tu portada o elígelos a mano.</p>
          {!disabled && (
            <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...DEFAULT_MANUAL_PALETTE })}>
              Elegir colores a mano
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

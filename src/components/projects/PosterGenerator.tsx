'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { PUBLIC_ACCENTS, PUBLIC_ACCENT_LABELS, PUBLIC_ACCENT_SWATCH, type PublicAccentKey } from '@/modules/projects/schema';
import { POSTER_FORMATS, POSTER_SIZES, type PosterFormat } from '@/modules/projects/services/poster-render';

/**
 * Genera y descarga el afiche de convocatoria del certamen (feed, story o
 * cuadrado), armado con los datos reales que ya tiene configurados el
 * micrositio público: nombre, fecha de la gala, requisitos de inscripción y
 * contacto. No guarda nada — el acento es solo una vista previa; el que
 * queda configurado para el sitio se edita en "Sitio público".
 */
export function PosterGenerator({ projectId, defaultAccent, hasPublicUrl }: { projectId: string; defaultAccent: PublicAccentKey; hasPublicUrl: boolean }) {
  const [format, setFormat] = useState<PosterFormat>('feed');
  const [accent, setAccent] = useState<PublicAccentKey>(defaultAccent);

  const src = `/api/projects/${projectId}/poster?format=${format}&accent=${accent}`;
  const downloadHref = `${src}&download=1`;
  const filename = `afiche-${format}.png`;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="poster-title">
      <div>
        <h2 id="poster-title" className="text-base font-semibold">
          Afiche para redes
        </h2>
        <p className="text-xs text-muted-foreground">
          Se arma solo con el nombre, la fecha de la gala, los requisitos de inscripción y el contacto que ya tiene configurado el sitio público. Lo que no esté
          configurado, no aparece en el afiche.
          {!hasPublicUrl && ' Sin un sitio publicado todavía, el afiche muestra tu contacto (Instagram, WhatsApp o correo) en vez de un enlace.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Formato">
        {POSTER_FORMATS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={format === f}
            onClick={() => setFormat(f)}
            className={`rounded-full border px-3 py-1 text-sm ${format === f ? 'border-foreground font-medium' : 'border-border text-muted-foreground'}`}
          >
            {POSTER_SIZES[f].label}
            <span className="ml-1.5 text-xs text-muted-foreground">{POSTER_SIZES[f].hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color del afiche">
        {PUBLIC_ACCENTS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={accent === a}
            aria-label={PUBLIC_ACCENT_LABELS[a]}
            onClick={() => setAccent(a)}
            className={`flex size-8 items-center justify-center rounded-full border-2 ${accent === a ? 'border-foreground' : 'border-transparent'}`}
          >
            <span className="size-5 rounded-full" style={{ background: PUBLIC_ACCENT_SWATCH[a] }} />
          </button>
        ))}
      </div>

      <div className="flex justify-center rounded-md border border-border bg-muted/40 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={src} src={src} alt="Vista previa del afiche" className="max-h-[70vh] w-auto rounded-sm shadow-md" style={{ aspectRatio: `${POSTER_SIZES[format].width} / ${POSTER_SIZES[format].height}` }} />
      </div>

      <a href={downloadHref} download={filename} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
        <Download aria-hidden="true" className="size-4" />
        Descargar PNG
      </a>
    </section>
  );
}

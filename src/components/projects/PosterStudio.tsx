'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Copy, Crown, Download, Handshake, HeartHandshake, Loader2, Megaphone, PackageOpen, Timer, Trophy, UserRound, Users, Vote, X, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { cn } from '@/lib/utils';
import { POSTER_FORMATS, POSTER_FORMAT_SPECS, type PosterFormat } from '@/lib/posters/formats';
import { POSTER_PIECES, POSTER_PIECE_INFO, type PieceAvailability, type PosterPiece } from '@/lib/posters/pieces';
import { POSTER_STYLES, POSTER_STYLE_INFO, type PosterStyle } from '@/lib/posters/styles';
import { PUBLIC_ACCENTS, PUBLIC_ACCENT_LABELS, PUBLIC_ACCENT_SWATCH, type PublicAccentKey } from '@/modules/projects/schema';

/**
 * Estudio de afiches del certamen: elige la pieza, el estilo, el formato y el
 * color, y la vista previa se genera en el servidor con los datos reales del
 * micrositio. Nada se guarda; el mensaje propio y el color solo viven en la
 * URL de la imagen. "Campaña completa" baja en un ZIP todas las piezas
 * disponibles en los tres formatos de Instagram.
 */

const PIECE_ICONS: Record<PosterPiece, LucideIcon> = {
  convocatoria: Megaphone,
  gala: CalendarDays,
  'cuenta-regresiva': Timer,
  candidata: UserRound,
  candidatas: Users,
  votacion: Vote,
  auspiciadores: HeartHandshake,
  auspicio: Handshake,
  resultados: Trophy,
  'salon-fama': Crown,
};

const KIT_FORMATS: PosterFormat[] = ['feed', 'story', 'square'];

interface Settings {
  piece: PosterPiece;
  style: PosterStyle;
  format: PosterFormat;
  accent: PublicAccentKey;
  candidateId: string | null;
  note: string;
  qr: boolean;
}

function posterUrl(projectId: string, settings: Settings): string {
  const query = new URLSearchParams({ piece: settings.piece, style: settings.style, format: settings.format, accent: settings.accent, qr: settings.qr ? '1' : '0' });
  if (settings.candidateId) query.set('candidate', settings.candidateId);
  if (settings.note.trim()) query.set('note', settings.note.trim());
  return `/api/projects/${projectId}/poster?${query.toString()}`;
}

async function fetchPoster(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'No se pudo generar el afiche');
  }
  return response.blob();
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export interface PosterStudioProps {
  projectId: string;
  slug: string;
  defaultAccent: PublicAccentKey;
  availability: Record<PosterPiece, PieceAvailability>;
  candidates: Array<{ id: string; label: string; hasPhoto: boolean }>;
  hasPublicUrl: boolean;
}

export function PosterStudio({ projectId, slug, defaultAccent, availability, candidates, hasPublicUrl }: PosterStudioProps) {
  const firstAvailable = POSTER_PIECES.find((piece) => availability[piece].available) ?? null;
  const [piece, setPiece] = useState<PosterPiece | null>(firstAvailable);
  const [style, setStyle] = useState<PosterStyle>('gala');
  const [format, setFormat] = useState<PosterFormat>('feed');
  const [accent, setAccent] = useState<PublicAccentKey>(defaultAccent);
  const [candidateId, setCandidateId] = useState<string | null>(candidates[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [debouncedNote, setDebouncedNote] = useState('');
  const [qrChoice, setQrChoice] = useState<boolean | null>(null);
  const qr = qrChoice ?? POSTER_FORMAT_SPECS[format].qrByDefault;

  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kit, setKit] = useState<{ done: number; total: number } | null>(null);
  const kitAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedNote(note), 700);
    return () => clearTimeout(timer);
  }, [note]);

  const settings = useMemo<Settings | null>(
    () => (piece ? { piece, style, format, accent, candidateId: piece === 'candidata' ? candidateId : null, note: debouncedNote, qr } : null),
    [piece, style, format, accent, candidateId, debouncedNote, qr],
  );

  useEffect(() => {
    if (!settings) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchPoster(posterUrl(projectId, settings), controller.signal)
      .then((blob) => {
        setPreview((previous) => {
          if (previous) URL.revokeObjectURL(previous.url);
          return { url: URL.createObjectURL(blob), blob };
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'No se pudo generar el afiche');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, settings]);

  useEffect(() => () => kitAbort.current?.abort(), []);

  const filename = piece ? `afiche-${slug}-${piece}-${format}.png` : 'afiche.png';

  const copyImage = useCallback(async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': preview.blob })]);
      toast.success('Imagen copiada: pégala en WhatsApp o donde quieras.');
    } catch {
      toast.error('Tu navegador no permite copiar imágenes. Usa "Descargar PNG".');
    }
  }, [preview]);

  const downloadKit = useCallback(async () => {
    if (!settings) return;
    const pieces = POSTER_PIECES.filter((p) => availability[p].available);
    const jobs: Array<{ settings: Settings; path: string }> = [];
    for (const p of pieces) {
      const targets = p === 'candidata' ? candidates.map((c) => c.id) : [null];
      for (const target of targets) {
        for (const f of KIT_FORMATS) {
          const label = p === 'candidata' ? `candidatas/${candidates.find((c) => c.id === target)?.label.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() ?? 'candidata'}` : p;
          jobs.push({ settings: { ...settings, piece: p, format: f, candidateId: target, qr: false }, path: `${label}-${f}.png` });
        }
      }
    }
    const controller = new AbortController();
    kitAbort.current = controller;
    setKit({ done: 0, total: jobs.length });
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      let done = 0;
      let failed = 0;
      for (const job of jobs) {
        if (controller.signal.aborted) return;
        try {
          zip.file(job.path, await fetchPoster(posterUrl(projectId, job.settings), controller.signal));
        } catch {
          if (controller.signal.aborted) return;
          failed++;
        }
        done++;
        setKit({ done, total: jobs.length });
      }
      saveBlob(await zip.generateAsync({ type: 'blob' }), `campana-${slug}-${style}.zip`);
      if (failed > 0) toast.warning(`${failed} de ${jobs.length} piezas no se pudieron generar; el resto está en el ZIP.`);
      else toast.success(`Campaña lista: ${jobs.length} piezas.`);
    } finally {
      kitAbort.current = null;
      setKit(null);
    }
  }, [availability, candidates, projectId, settings, slug, style]);

  if (!piece) {
    return (
      <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
        Ninguna pieza está disponible todavía. Configura el sitio público del certamen (fecha de la gala, convocatoria, candidatas o auspiciadores) y vuelve aquí.
      </section>
    );
  }

  const spec = POSTER_FORMAT_SPECS[format];

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5 lg:order-1">
        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-labelledby="poster-piece">
          <h2 id="poster-piece" className="text-sm font-semibold">
            Pieza
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" role="radiogroup" aria-labelledby="poster-piece">
            {POSTER_PIECES.map((p) => {
              const state = availability[p];
              const Icon = PIECE_ICONS[p];
              const selected = piece === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!state.available}
                  onClick={() => setPiece(p)}
                  title={state.available ? POSTER_PIECE_INFO[p].description : state.reason}
                  className={cn(
                    'flex min-w-0 items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors',
                    selected ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30',
                    !state.available && 'cursor-not-allowed opacity-55 hover:border-border',
                  )}
                >
                  <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{POSTER_PIECE_INFO[p].label}</span>
                    <span className="block text-xs text-muted-foreground">{state.available ? POSTER_PIECE_INFO[p].description : state.reason}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {piece === 'candidata' && candidates.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Candidata</span>
              <select className={nativeSelectClass} value={candidateId ?? ''} onChange={(event) => setCandidateId(event.target.value)}>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                    {candidate.hasPhoto ? '' : ' (sin foto)'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-labelledby="poster-design">
          <h2 id="poster-design" className="text-sm font-semibold">
            Diseño
          </h2>
          <div className="grid gap-2" role="radiogroup" aria-label="Estilo">
            {POSTER_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={style === s}
                onClick={() => setStyle(s)}
                className={cn('min-w-0 rounded-md border p-2.5 text-left', style === s ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30')}
              >
                <span className="block text-sm font-medium">{POSTER_STYLE_INFO[s].label}</span>
                <span className="block text-xs text-muted-foreground">{POSTER_STYLE_INFO[s].description}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Formato">
            {POSTER_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={format === f}
                onClick={() => setFormat(f)}
                title={POSTER_FORMAT_SPECS[f].hint}
                className={cn('rounded-full border px-3 py-1 text-sm', format === f ? 'border-primary bg-primary/5 font-medium' : 'border-border text-muted-foreground hover:border-foreground/30')}
              >
                {POSTER_FORMAT_SPECS[f].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {spec.hint} · {spec.width} × {spec.height} px
          </p>

          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color">
            {PUBLIC_ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={accent === a}
                aria-label={PUBLIC_ACCENT_LABELS[a]}
                title={PUBLIC_ACCENT_LABELS[a]}
                onClick={() => setAccent(a)}
                className={cn('flex size-8 items-center justify-center rounded-full border-2', accent === a ? 'border-foreground' : 'border-transparent')}
              >
                <span className="size-5 rounded-full" style={{ background: PUBLIC_ACCENT_SWATCH[a] }} />
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card" aria-labelledby="poster-extra">
          <h2 id="poster-extra" className="text-sm font-semibold">
            Extras
          </h2>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Mensaje propio (opcional)</span>
            <textarea
              className={cn(textareaClass, 'min-h-16')}
              maxLength={140}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ej.: Casting presencial el sábado 18 a las 10:00 h"
            />
            <span className="block text-right text-xs text-muted-foreground">{note.length}/140</span>
          </label>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm">Código QR</p>
              <p className="text-xs text-muted-foreground">Lleva directo a postular, comprar entradas o votar, según la pieza.</p>
            </div>
            <Switch checked={qr} onCheckedChange={setQrChoice} label="Incluir código QR" />
          </div>
          {!hasPublicUrl && <p className="text-xs text-muted-foreground">El sitio público aún no está publicado: el afiche no muestra su dirección.</p>}
        </section>
      </div>

      {/* En el teléfono la vista previa va primero; en escritorio queda fija junto a los controles. */}
      <section className="order-first min-w-0 space-y-3 self-start rounded-lg border border-border bg-card p-4 shadow-card lg:sticky lg:top-4 lg:order-2" aria-label="Vista previa">
        <div className="relative flex min-h-[320px] items-center justify-center rounded-md border border-border bg-muted/40 p-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={`Vista previa: ${POSTER_PIECE_INFO[piece].label}, ${spec.label}`}
              className={cn('h-auto max-h-[60vh] w-auto max-w-full rounded-sm shadow-md transition-opacity lg:max-h-[72vh]', loading && 'opacity-40')}
              style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
            />
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" role="status">
              <Loader2 aria-hidden="true" className="size-6 animate-spin text-muted-foreground" />
              <span className="sr-only">Generando afiche…</span>
            </div>
          )}
          {error && !loading && (
            <p role="alert" className="absolute inset-x-4 bottom-4 rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!preview || loading} onClick={() => preview && saveBlob(preview.blob, filename)}>
            <Download aria-hidden="true" className="size-4" />
            Descargar PNG
          </Button>
          <Button type="button" variant="outline" disabled={!preview || loading} onClick={copyImage}>
            <Copy aria-hidden="true" className="size-4" />
            Copiar imagen
          </Button>
          {kit ? (
            <Button type="button" variant="outline" onClick={() => kitAbort.current?.abort()}>
              <X aria-hidden="true" className="size-4" />
              Cancelar ({kit.done}/{kit.total})
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={downloadKit} title="Todas las piezas disponibles en feed, story y cuadrado, con este estilo y color, en un ZIP">
              <PackageOpen aria-hidden="true" className="size-4" />
              Campaña completa (ZIP)
            </Button>
          )}
        </div>
        {kit && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={kit.total} aria-valuenow={kit.done} aria-label="Generando campaña">
            <div className="h-full bg-primary transition-all" style={{ width: `${(kit.done / Math.max(kit.total, 1)) * 100}%` }} />
          </div>
        )}
      </section>
    </div>
  );
}

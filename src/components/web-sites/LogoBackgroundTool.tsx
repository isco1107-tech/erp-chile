'use client';

import { useContext, useDeferredValue, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Eraser, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DEFAULT_LOGO_BACKGROUND,
  processingSize,
  removeLogoBackground,
  transparentLogoFileName,
  type HoleToggle,
  type LogoBackgroundResult,
} from '@/lib/web-sites/logo-background';
import { EditorAssetsContext, formatBytes, MAX_UPLOAD_BYTES, uploadWebSiteImage, type EditorAsset } from './editor-shared';
import { SwitchRow } from './fields';
import { Notice } from './block-fields-shared';

interface LogoBackgroundToolProps {
  /** Logo actual (de la biblioteca del editor). */
  url: string;
  /** Nombre de la marca: queda como descripción del PNG nuevo. */
  alt: string;
  disabled?: boolean;
  /** El diseño dibuja tarjetas: se sugiere oscurecerlas si el logo se confunde. */
  backdropHint?: boolean;
  /** Recibe el PNG nuevo (ya en la biblioteca). */
  onDone: (url: string, asset: EditorAsset) => void;
}

interface Source {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

type Load = { state: 'idle' | 'loading' } | { state: 'error'; error: string } | { state: 'ready'; source: Source };

/**
 * Fondos donde se prueba el resultado: transparente (cuadriculado) y los tres
 * de «Fondo de las tarjetas» (`LOGO_BACKDROPS`) en un sitio claro: los mismos
 * tonos que `site-css.ts` (`.ws-backdrop-shade` / `.ws-backdrop-dark`).
 */
const PREVIEWS: { id: PreviewId; label: string; style: CSSProperties }[] = [
  { id: 'clear', label: 'Transparente', style: { backgroundImage: 'repeating-conic-gradient(#d4d4d8 0% 25%, #ffffff 0% 50%)', backgroundSize: '16px 16px' } },
  { id: 'card', label: 'Fondo normal', style: { backgroundColor: '#f6f6f6' } },
  { id: 'shade', label: 'Un poco más oscuro', style: { backgroundColor: '#c0c0c0' } },
  { id: 'dark', label: 'Oscuro', style: { backgroundColor: '#15171c' } },
];

type PreviewId = 'clear' | 'card' | 'shade' | 'dark';

/** Margen de un toque (en px de pantalla): un dedo no acierta al centro de una «e» chica. */
const TAP_SLOP = 10;

/**
 * Hueco bajo un toque en la vista previa (que muestra el resultado recortado y
 * achicado). Si el punto exacto no cae en un hueco, busca el más cercano dentro
 * de `TAP_SLOP`. Devuelve el punto en la imagen de trabajo y el número de hueco.
 */
function holeUnderTap(event: MouseEvent<HTMLCanvasElement>, result: LogoBackgroundResult, sourceWidth: number): { x: number; y: number; hole: number } | null {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scale = result.width / rect.width;
  const cx = Math.floor((event.clientX - rect.left) * scale);
  const cy = Math.floor((event.clientY - rect.top) * scale);
  const reach = Math.max(1, Math.ceil(TAP_SLOP * scale));
  let best: { x: number; y: number; hole: number; distance: number } | null = null;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      const distance = dx * dx + dy * dy;
      if (x < 0 || y < 0 || x >= result.width || y >= result.height || distance > reach * reach || (best && distance >= best.distance)) continue;
      const sx = result.offset.x + x;
      const sy = result.offset.y + y;
      const hole = result.holeLabels[sy * sourceWidth + sx] ?? 0;
      if (hole) best = { x: sx, y: sy, hole, distance };
    }
  }
  return best ? { x: best.x, y: best.y, hole: best.hole } : null;
}

async function readSource(url: string, signal: AbortSignal): Promise<Source> {
  const response = await fetch(`/api/web-sites/image-source?url=${encodeURIComponent(url)}`, { signal, cache: 'no-store' });
  if (!response.ok) {
    let message = 'No se pudo abrir el logo. Intenta de nuevo.';
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') message = payload.error;
    } catch {
      // Respuesta sin JSON: queda el mensaje general.
    }
    throw new Error(message);
  }
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const size = processingSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Tu navegador no permite editar imágenes.');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const pixels = context.getImageData(0, 0, size.width, size.height);
    return { data: pixels.data, width: size.width, height: size.height };
  } finally {
    bitmap.close();
  }
}

function paint(canvas: HTMLCanvasElement | null, result: LogoBackgroundResult) {
  if (!canvas) return;
  canvas.width = result.width;
  canvas.height = result.height;
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height), 0, 0);
}

function toPngFile(result: LogoBackgroundResult, fileName: string): Promise<File | null> {
  const canvas = document.createElement('canvas');
  paint(canvas, result);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], fileName, { type: 'image/png' }) : null), 'image/png'));
}

/**
 * «Quitar fondo (PNG)» de un logo: lo abre por nuestro dominio
 * (`/api/web-sites/image-source`), le quita el fondo liso en el navegador
 * (`removeLogoBackground`, con vista previa en vivo sobre los fondos posibles
 * de la tarjeta) y sube el PNG por el MISMO camino que cualquier imagen del
 * editor (`uploadAsset` del contexto o la biblioteca del sitio): mismos
 * permisos, carpeta y validación por firma. El original queda en la biblioteca.
 */
export function LogoBackgroundTool({ url, alt, disabled, backdropHint, onDone }: LogoBackgroundToolProps) {
  const assets = useContext(EditorAssetsContext);
  const strengthId = useId();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const [strength, setStrength] = useState(DEFAULT_LOGO_BACKGROUND.strength);
  const [holes, setHoles] = useState(DEFAULT_LOGO_BACKGROUND.holes);
  const [toggles, setToggles] = useState<HoleToggle[]>([]);
  const [preview, setPreview] = useState<PreviewId>('clear');
  const [tapNote, setTapNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const mainCanvas = useRef<HTMLCanvasElement | null>(null);
  const deferredStrength = useDeferredValue(strength);
  const readOnly = Boolean(disabled || assets?.readOnly);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoad({ state: 'loading' });
    setToggles([]);
    setTapNote(null);
    readSource(url, controller.signal)
      .then((source) => setLoad({ state: 'ready', source }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ state: 'error', error: error instanceof Error && error.message ? error.message : 'No se pudo abrir el logo. Intenta de nuevo.' });
      });
    return () => controller.abort();
  }, [open, url]);

  const source = load.state === 'ready' ? load.source : null;
  const result = useMemo(
    () => (source ? removeLogoBackground(source.data, source.width, source.height, { strength: deferredStrength, holes, toggles }) : null),
    [source, deferredStrength, holes, toggles],
  );

  useEffect(() => {
    if (!result) return;
    paint(mainCanvas.current, result);
    for (const canvas of canvases.current) paint(canvas, result);
  }, [result]);

  /** Tocar un relleno lo quita o lo devuelve (el último toque sobre un hueco manda). */
  function toggleAt(event: MouseEvent<HTMLCanvasElement>) {
    if (!result || result.status !== 'ok' || saving) return;
    const target = source ? holeUnderTap(event, result, source.width) : null;
    if (!target) {
      setTapNote(result.holes.total > 0 ? 'Ahí no hay relleno que quitar: toca justo dentro de la letra (por ejemplo, en el centro de la «O»).' : 'Este logo no tiene rellenos encerrados que quitar.');
      return;
    }
    setTapNote(null);
    setToggles((previous) => [...previous.slice(-49), { x: target.x, y: target.y, remove: !result.holeRemoved[target.hole] }]);
  }

  async function save() {
    if (!result || result.status !== 'ok' || !source || !assets) return;
    setSaving(true);
    setSaveError(null);
    try {
      const original = assets.assets.find((asset) => asset.url === url)?.fileName ?? url;
      const file = await toPngFile(result, transparentLogoFileName(original));
      if (!file) {
        setSaveError('Tu navegador no pudo crear el PNG. Intenta de nuevo.');
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setSaveError(`El PNG pesa ${formatBytes(file.size)} y el máximo es ${formatBytes(MAX_UPLOAD_BYTES)}. Sube el logo en un tamaño menor.`);
        return;
      }
      const description = alt.trim().slice(0, 160);
      const outcome = await (assets.uploadAsset ? assets.uploadAsset(file, description) : uploadWebSiteImage(assets.siteId, file, description));
      if (!outcome.ok) {
        setSaveError(outcome.error);
        return;
      }
      assets.addAsset(outcome.asset);
      onDone(outcome.asset.url, outcome.asset);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const statusNotice =
    result?.status === 'already-transparent'
      ? 'Este logo ya tiene el fondo transparente: no hay nada que quitar.'
      : result?.status === 'nothing-removed'
        ? 'No encontramos un fondo de un solo color alrededor del logo (¿es una foto?). Prueba con más intensidad o sube el logo en PNG con fondo transparente.'
        : result?.status === 'nothing-left'
          ? 'Con esta intensidad se borra el logo completo: bájala.'
          : result?.uneven
            ? 'El fondo no es de un solo color: revisa que el logo no haya perdido partes ni conserve restos del fondo.'
            : null;

  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={readOnly || !assets} onClick={() => setOpen(true)}>
        <Eraser className="size-3.5" aria-hidden="true" /> Quitar fondo (PNG)
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          setOpen(next);
          if (!next) setSaveError(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quitar el fondo del logo</DialogTitle>
            <DialogDescription>Lo deja como PNG con fondo transparente para que se vea bien sobre cualquier color. El original queda en la biblioteca por si quieres volver a él.</DialogDescription>
          </DialogHeader>

          {load.state === 'loading' || load.state === 'idle' ? (
            <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Abriendo el logo…
            </p>
          ) : load.state === 'error' ? (
            <Notice>{load.error}</Notice>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border border-border p-4 sm:h-52" style={PREVIEWS.find((item) => item.id === preview)?.style}>
                  <canvas
                    ref={(canvas) => {
                      mainCanvas.current = canvas;
                      if (canvas && result) paint(canvas, result);
                    }}
                    role="img"
                    aria-label="Vista previa del logo sin fondo"
                    onClick={toggleAt}
                    className={cn('max-h-full max-w-full shrink-0', result && result.holes.total > 0 && 'cursor-pointer')}
                  />
                </div>
                <div role="group" aria-label="Fondo de la vista previa" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PREVIEWS.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={preview === item.id}
                      onClick={() => setPreview(item.id)}
                      className={cn(
                        'min-w-0 space-y-1 rounded-lg border p-1 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                        preview === item.id ? 'border-ring ring-2 ring-ring/40' : 'border-border hover:border-ring',
                      )}
                    >
                      <span className="flex h-12 items-center justify-center overflow-hidden rounded-md p-1.5" style={item.style}>
                        <canvas
                          ref={(canvas) => {
                            canvases.current[index] = canvas;
                            if (canvas && result) paint(canvas, result);
                          }}
                          aria-hidden="true"
                          className="max-h-full max-w-full shrink-0"
                        />
                      </span>
                      <span className="block text-xs leading-tight text-muted-foreground">{item.label}</span>
                    </button>
                  ))}
                </div>
                {result?.status === 'ok' && result.holes.total > 0 ? (
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {holes || toggles.length > 0 ? `Rellenos de letras quitados: ${result.holes.removed} de ${result.holes.total}. ` : ''}
                    Toca en la vista previa el relleno de una letra (por ejemplo, el centro de la «O») para quitarlo o devolverlo.
                  </p>
                ) : null}
                {tapNote ? (
                  <p className="text-xs text-warning" role="status">
                    {tapNote}
                  </p>
                ) : null}
              </div>
              {statusNotice ? <Notice>{statusNotice}</Notice> : null}
              {result?.status !== 'already-transparent' ? (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor={strengthId} className="text-sm font-medium">
                        Intensidad
                      </label>
                      <span className="text-xs text-muted-foreground tabular-nums">{strength}</span>
                    </div>
                    <input
                      id={strengthId}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={strength}
                      disabled={saving}
                      onChange={(event) => setStrength(Number(event.target.value))}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs text-muted-foreground">Súbela si quedan restos del fondo alrededor del logo; bájala si se borran partes del logo.</p>
                  </div>
                  <SwitchRow
                    label="Quitar el relleno de las letras"
                    description="El fondo que queda dentro de letras como la «O», la «A» o la «e». Las partes del dibujo del mismo color que el fondo (por ejemplo, letras blancas dentro de un círculo) se conservan."
                    checked={holes}
                    onChange={(next) => {
                      setHoles(next);
                      setToggles([]);
                      setTapNote(null);
                    }}
                    disabled={saving}
                  />
                </>
              ) : null}
              {backdropHint ? <p className="text-xs text-muted-foreground">Si el logo se confunde con su tarjeta, en «Fondo de las tarjetas» elige «Un poco más oscuro» u «Oscuro».</p> : null}
            </div>
          )}

          {saveError ? <Notice>{saveError}</Notice> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving || result?.status !== 'ok'} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} Usar este PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

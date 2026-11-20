'use client';

import { Crosshair, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CANVAS_IMAGE_FITS, type CanvasElement } from '@/lib/web-sites/canvas';
import { safeImageSrc } from '@/lib/web-sites/urls';

function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void;
}) {
  return <label className="flex flex-col gap-1 text-xs">
    <span className="flex justify-between gap-2">{label}<span aria-hidden="true" className="text-muted-foreground tabular-nums">{value}{suffix}</span></span>
    <input type="range" className="w-full accent-primary" min={min} max={max} step={step} value={value}
      onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
  </label>;
}

const DEFAULT_IMAGE_FRAME = { fit: 'cover', x: 50, y: 50, zoom: 100 } as const;

export function CanvasImageFrameEditor({ element, defaultFit = 'cover', onChange }: {
  element: CanvasElement; defaultFit?: (typeof CANVAS_IMAGE_FITS)[number]; onChange: (patch: Partial<CanvasElement>) => void;
}) {
  const src = safeImageSrc(element.imageUrl);
  const frame = element.imageFrame ?? { ...DEFAULT_IMAGE_FRAME, fit: defaultFit };
  const update = (patch: Partial<NonNullable<CanvasElement['imageFrame']>>) => onChange({ imageFrame: { ...frame, ...patch } });
  if (!src) return null;

  return <div className="space-y-3 rounded-lg border border-border p-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold">Encuadre de la imagen</p>
      <Button type="button" size="icon-sm" variant="ghost" aria-label="Restablecer encuadre" title="Restablecer encuadre"
        disabled={!element.imageFrame} onClick={() => onChange({ imageFrame: undefined })}><RotateCcw aria-hidden="true" /></Button>
    </div>
    <div className="grid grid-cols-2 gap-1" role="group" aria-label="Ajuste de imagen">
      {CANVAS_IMAGE_FITS.map((fit) => <Button key={fit} type="button" size="sm" aria-pressed={frame.fit === fit}
        variant={frame.fit === fit ? 'secondary' : 'outline'} onClick={() => update({ fit, ...(fit === 'contain' && { zoom: 100 }) })}>
        {fit === 'cover' ? 'Rellenar' : 'Mostrar completa'}
      </Button>)}
    </div>
    <div className="grid min-w-0 place-items-center overflow-hidden rounded-md bg-muted">
      <button type="button" aria-label="Elegir punto de enfoque en la imagen"
        title="Haz clic sobre la parte de la foto que quieres destacar"
        className="relative block max-w-full cursor-crosshair rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
        onClick={(event) => {
          if (!event.detail) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (!bounds.width || !bounds.height) return;
          const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100)));
          update({ x: percent((event.clientX - bounds.left) / bounds.width), y: percent((event.clientY - bounds.top) / bounds.height) });
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="max-h-28 max-w-full" draggable={false} />
        <span aria-hidden="true" className="pointer-events-none absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/75 text-white"
          style={{ left: `${frame.x}%`, top: `${frame.y}%` }}><Crosshair className="size-4" /></span>
      </button>
    </div>
    <Slider label="Ampliación" value={frame.zoom} suffix=" %" min={100} max={300} onChange={(zoom) => update({ zoom })} />
    <div className="grid grid-cols-2 gap-3">
      <Slider label="Enfoque horizontal" value={frame.x} suffix=" %" min={0} max={100} onChange={(x) => update({ x })} />
      <Slider label="Enfoque vertical" value={frame.y} suffix=" %" min={0} max={100} onChange={(y) => update({ y })} />
    </div>
  </div>;
}

export function CanvasLayerFinish({ element, onChange }: {
  element: CanvasElement; onChange: (patch: Partial<CanvasElement>) => void;
}) {
  const gradient = element.gradient;
  const border = element.border;
  return <div className="space-y-4">
    <label className="block space-y-1 text-xs">Relleno
      <select aria-label="Relleno de la capa" className="block h-9 w-full rounded-md border border-border bg-background px-2" value={element.transparent ? 'none' : gradient ? 'gradient' : 'solid'}
        onChange={(event) => {
          const fill = event.currentTarget.value;
          onChange({ transparent: fill === 'none', gradient: fill === 'gradient' ? gradient ?? { color: '#7d557a', angle: 135 } : undefined });
        }}>
        <option value="none">Transparente</option><option value="solid">Color sólido</option><option value="gradient">Degradado</option>
      </select>
    </label>
    {!element.transparent && <div className="grid grid-cols-2 gap-3">
      <label className="text-xs">{gradient ? 'Color inicial' : 'Color de fondo'}
        <input type="color" className="block h-9 w-full" value={element.background} onChange={(event) => onChange({ background: event.currentTarget.value })} />
      </label>
      {gradient && <label className="text-xs">Color final
        <input type="color" className="block h-9 w-full" value={gradient.color} onChange={(event) => onChange({ gradient: { ...gradient, color: event.currentTarget.value } })} />
      </label>}
    </div>}
    {!element.transparent && gradient &&
      <Slider label="Dirección del degradado" value={gradient.angle} min={0} max={360} suffix="°" onChange={(angle) => onChange({ gradient: { ...gradient, angle } })} />}
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-primary" checked={Boolean(border)}
        onChange={(event) => onChange({ border: event.currentTarget.checked ? { color: '#a98530', width: 1 } : undefined })} /> Agregar borde
    </label>
    {border && <div className="grid grid-cols-2 items-center gap-3">
      <label className="text-xs">Color del borde<input type="color" className="block h-9 w-full" value={border.color}
        onChange={(event) => onChange({ border: { ...border, color: event.currentTarget.value } })} /></label>
      <Slider label="Grosor" value={border.width} min={1} max={16} suffix=" px" onChange={(width) => onChange({ border: { ...border, width } })} />
    </div>}
  </div>;
}

export function CanvasTextSpacing({ element, onChange }: {
  element: CanvasElement; onChange: (patch: Partial<CanvasElement>) => void;
}) {
  return <div className="space-y-3">
    <Slider label="Interlineado" value={element.lineHeight ?? 1.2} min={0.9} max={2.4} step={0.05} onChange={(lineHeight) => onChange({ lineHeight })} />
    <Slider label="Espaciado entre letras" value={Math.round((element.letterSpacing ?? 0) * 100)} min={-6} max={25}
      suffix=" %" onChange={(letterSpacing) => onChange({ letterSpacing: letterSpacing / 100 })} />
  </div>;
}

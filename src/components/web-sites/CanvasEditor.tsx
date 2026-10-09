'use client';

import { useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CANVAS_MAX_ELEMENTS, CANVAS_MOTIONS, canvasElementSchema, canvasElementStyle, canvasFontSize, canvasPosition, canvasSchema, constrainPosition, type CanvasDevice, type CanvasElement, type CanvasPosition, type SiteCanvas } from '@/lib/web-sites/canvas';
import type { SiteDocument } from '@/lib/web-sites/site';
import { CanvasContent } from './site/CanvasScene';
import { TextField, SwitchRow } from './fields';
import { ImagePicker } from './ImagePicker';
import { LinkField } from './LinkField';

interface Props {
  value?: SiteCanvas;
  background?: string;
  disabled: boolean;
  onChange: (value: SiteCanvas) => void;
  document: SiteDocument;
  pageId: string;
}
interface Gesture {
  id: string; pointerId: number; device: CanvasDevice;
  mode: 'move' | 'resize'; startX: number; startY: number;
  width: number; height: number; initial: CanvasPosition; current: CanvasPosition;
}
const KIND_LABELS = { text: 'Texto', image: 'Imagen', button: 'Botón', shape: 'Forma' } as const;
const MOTION_LABELS = { none: 'Sin movimiento', fade: 'Aparecer', rise: 'Subir', zoom: 'Zoom', float: 'Flotar' } as const;

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="block space-y-1 text-xs font-medium">{label}<input className="h-9 w-full rounded-md border border-border bg-background px-2" type="number" min={min} max={max} step={1} value={Math.round(value * 100) / 100} onChange={(event) => { const n = event.currentTarget.valueAsNumber; if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n))); }} /></label>;
}

export function CanvasEditor({ value, background = '#ffffff', disabled, onChange, document, pageId }: Props) {
  const canvas = value ?? canvasSchema.parse({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<CanvasDevice>('desktop');
  const [snap, setSnap] = useState(true);
  const [draft, setDraft] = useState<CanvasPosition | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [studioOpen, setStudioOpen] = useState(Boolean(value?.enabled));
  const gesture = useRef<Gesture | null>(null);
  const selected = canvas.elements.find((el) => el.id === selectedId);
  const height = device === 'mobile' ? canvas.mobileHeight : canvas.height;
  const artboardWidth = device === 'mobile' ? 390 : device === 'tablet' ? 768 : 1200;
  const set = (patch: Partial<SiteCanvas>) => { if (!disabled) onChange({ ...canvas, ...patch }); };
  const update = (id: string, patch: Partial<CanvasElement>) => set({ elements: canvas.elements.map((el) => el.id === id ? { ...el, ...patch } : el) });
  const setPosition = (el: CanvasElement, patch: Partial<CanvasPosition>) => update(el.id, { [device]: constrainPosition({ ...canvasPosition(el, device), ...patch }) });

  function add(kind: CanvasElement['kind']) {
    if (disabled || canvas.elements.length >= CANVAS_MAX_ELEMENTS) return;
    const id = `c${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const element = canvasElementSchema.parse({ id, kind, name: KIND_LABELS[kind], text: kind === 'text' ? 'Escribe tu idea aquí' : kind === 'button' ? 'Descubre más' : '', transparent: kind === 'text' || kind === 'image', background: kind === 'shape' ? '#e0e7ff' : '#4f46e5', color: kind === 'button' ? '#ffffff' : '#111827', radius: kind === 'button' ? 16 : 0, desktop: { x: 10, y: 10, width: kind === 'button' ? 25 : 40, height: kind === 'button' ? 12 : 25 } });
    set({ elements: [...canvas.elements, element] });
    setSelectedId(id);
  }

  function begin(event: PointerEvent<HTMLElement>, el: CanvasElement, mode: Gesture['mode']) {
    event.stopPropagation();
    setSelectedId(el.id);
    if (disabled || el.locked || event.button !== 0) return;
    const board = event.currentTarget.closest('[data-canvas-board]')?.getBoundingClientRect();
    if (!board || !board.width || !board.height) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const initial = canvasPosition(el, device);
    gesture.current = { id: el.id, pointerId: event.pointerId, device, mode, startX: event.clientX, startY: event.clientY, width: board.width, height: board.height, initial, current: initial };
    setDraft(initial);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = (event.clientX - g.startX) / g.width * 100;
    const dy = (event.clientY - g.startY) / g.height * 100;
    const round = (n: number) => snap ? Math.round(n) : n;
    g.current = constrainPosition(g.mode === 'move'
      ? { ...g.initial, x: round(g.initial.x + dx), y: round(g.initial.y + dy) }
      : { ...g.initial, width: Math.min(100 - g.initial.x, round(g.initial.width + dx)), height: Math.min(100 - g.initial.y, round(g.initial.height + dy)) });
    setDraft(g.current);
  }
  function finish(event: PointerEvent<HTMLElement>, cancelled = false) {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDraft(null);
    if (!cancelled) update(g.id, { [g.device]: g.current });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyMove(event: KeyboardEvent<HTMLElement>, el: CanvasElement) {
    if (disabled || el.locked) return;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    const p = canvasPosition(el, device), step = event.shiftKey ? 5 : 1;
    setPosition(el, { x: p.x + d[0] * step, y: p.y + d[1] * step });
  }
  function layer(direction: -1 | 1) {
    const index = canvas.elements.findIndex((el) => el.id === selectedId);
    if (index < 0 || index + direction < 0 || index + direction >= canvas.elements.length) return;
    const elements = [...canvas.elements];
    [elements[index], elements[index + direction]] = [elements[index + direction], elements[index]];
    set({ elements });
  }

  const studio = (
      <div className="space-y-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Diseña libremente</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(!expanded)}>{expanded ? 'Cerrar vista ampliada' : 'Ampliar estudio'}</Button>
        </div>
        <fieldset disabled={disabled} className="space-y-4">
          <SwitchRow label="Activar lienzo en esta sección" checked={canvas.enabled} onChange={(enabled) => set({ enabled })} />
          {canvas.enabled && <>
            <SwitchRow label="Usar únicamente el lienzo" checked={canvas.replaceContent} onChange={(replaceContent) => set({ replaceContent })} description="Reemplaza el contenido de la sección. Se conserva para volver a usarlo." />
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_LABELS) as CanvasElement['kind'][]).map((kind) => <Button key={kind} type="button" size="sm" variant="outline" disabled={disabled || canvas.elements.length >= CANVAS_MAX_ELEMENTS} onClick={() => add(kind)}>+ {KIND_LABELS[kind]}</Button>)}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs">Dispositivo <select aria-label="Dispositivo del lienzo" className="rounded border border-border bg-background p-2" value={device} onChange={(e) => { gesture.current = null; setDraft(null); setDevice(e.target.value as CanvasDevice); }}><option value="desktop">Escritorio</option><option value="tablet">Tablet</option><option value="mobile">Móvil</option></select></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />Ajustar a cuadrícula</label>
              <NumberField label="Altura del lienzo (px)" value={height} min={160} max={1600} onChange={(n) => set(device === 'mobile' ? { mobileHeight: n } : { height: n })} />
            </div>
            <p className="text-xs text-muted-foreground">Arrastra para mover; usa la esquina para cambiar el tamaño. Las flechas mueven la capa seleccionada; Mayús mueve más. Tablet y móvil heredan escritorio hasta que ajustes su composición.</p>
            <div className={expanded ? 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]' : 'space-y-4'}>
              <div className="min-w-0 overflow-auto rounded-lg border border-border bg-muted/30 p-2">
                <div data-canvas-board className="relative mx-auto overflow-hidden bg-background" style={{ width: '100%', maxWidth: artboardWidth, aspectRatio: `${artboardWidth} / ${height}`, containerType: 'inline-size', backgroundColor: background, backgroundImage: snap ? 'linear-gradient(#88888815 1px,transparent 1px),linear-gradient(90deg,#88888815 1px,transparent 1px)' : undefined, backgroundSize: '5% 5%' }}>
                  {canvas.elements.filter((el) => !el.hidden && !(device === 'mobile' && el.mobileHidden)).map((el, index) => {
                    const p = draft && selectedId === el.id ? draft : canvasPosition(el, device);
                    return <div key={el.id} role="button" tabIndex={0} aria-label={`${el.name}${el.locked ? ', bloqueado' : ', mover con las flechas'}`} aria-pressed={selectedId === el.id} onClick={() => setSelectedId(el.id)} onKeyDown={(e) => keyMove(e, el)} onPointerDown={(e) => begin(e, el, 'move')} onPointerMove={move} onPointerUp={finish} onPointerCancel={(e) => finish(e, true)} onLostPointerCapture={(e) => finish(e, true)} className="absolute select-none focus-visible:outline-2 focus-visible:outline-primary" style={{ ...canvasElementStyle(el), left: `${p.x}%`, top: `${p.y}%`, width: `${p.width}%`, height: `${p.height}%`, zIndex: index + 1, fontSize: `clamp(10px,${canvasFontSize(el, device) / (artboardWidth / 100)}cqw,160px)`, lineHeight: 1.2, display: 'flex', alignItems: 'center', cursor: disabled || el.locked ? 'default' : 'move', touchAction: 'none', outline: selectedId === el.id ? '2px solid #6366f1' : undefined }}>
                      <CanvasContent element={el} />
                      {selectedId === el.id && !el.locked && !disabled && <button type="button" aria-label={`Redimensionar ${el.name}`} className="absolute -right-1 -bottom-1 size-4 rounded-sm border-2 border-white bg-indigo-500" style={{ touchAction: 'none', cursor: 'nwse-resize' }} onPointerDown={(e) => begin(e, el, 'resize')} onPointerMove={move} onPointerUp={finish} onPointerCancel={(e) => finish(e, true)} onLostPointerCapture={(e) => finish(e, true)} />}
                    </div>;
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-1"><p className="text-xs font-semibold">Capas · arriba = al frente</p>{[...canvas.elements].reverse().map((el) => <button key={el.id} type="button" aria-pressed={selectedId === el.id} className={`block w-full rounded border px-2 py-1.5 text-left text-xs ${selectedId === el.id ? 'border-primary bg-accent' : 'border-border'}`} onClick={() => setSelectedId(el.id)}>{el.name} {el.hidden ? '· oculta' : ''} {el.locked ? '· bloqueada' : ''}</button>)}</div>
                {selected && <>
                  <TextField label="Nombre de la capa" value={selected.name} max={80} disabled={disabled} onChange={(name) => update(selected.id, { name })} />
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" size="xs" variant="outline" onClick={() => layer(1)}>Al frente</Button><Button type="button" size="xs" variant="outline" onClick={() => layer(-1)}>Al fondo</Button>
                    <Button type="button" size="xs" variant="outline" disabled={disabled || canvas.elements.length >= CANVAS_MAX_ELEMENTS} onClick={() => { const copy = { ...structuredClone(selected), id: `c${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`, name: `${selected.name.slice(0, 70)} (copia)` }; set({ elements: [...canvas.elements, copy] }); setSelectedId(copy.id); }}>Duplicar</Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => { set({ elements: canvas.elements.filter((el) => el.id !== selected.id) }); setSelectedId(null); }}>Eliminar</Button>
                  </div>
                  <SwitchRow label="Bloquear posición" checked={selected.locked} onChange={(locked) => update(selected.id, { locked })} />
                  <SwitchRow label="Ocultar capa" checked={selected.hidden} onChange={(hidden) => update(selected.id, { hidden })} />
                  <SwitchRow label="Ocultar en móvil" checked={selected.mobileHidden} onChange={(mobileHidden) => update(selected.id, { mobileHidden })} />
                  <fieldset disabled={disabled || selected.locked} className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map((key) => <NumberField key={key} label={{ x: 'X (%)', y: 'Y (%)', width: 'Ancho (%)', height: 'Alto (%)' }[key]} value={canvasPosition(selected, device)[key]} min={key === 'width' || key === 'height' ? 2 : 0} max={100} onChange={(n) => setPosition(selected, { [key]: n })} />)}</fieldset>
                  <div className="flex flex-wrap gap-2"><Button type="button" size="xs" variant="outline" disabled={disabled || selected.locked} onClick={() => setPosition(selected, { x: (100 - canvasPosition(selected, device).width) / 2 })}>Centrar horizontal</Button><Button type="button" size="xs" variant="outline" disabled={disabled || selected.locked} onClick={() => setPosition(selected, { y: (100 - canvasPosition(selected, device).height) / 2 })}>Centrar vertical</Button></div>
                  {device !== 'desktop' && <Button type="button" size="sm" variant="outline" onClick={() => update(selected.id, { [device]: undefined })}>Heredar posición de escritorio</Button>}
                  {(selected.kind === 'text' || selected.kind === 'button') && <TextField label="Contenido" value={selected.text} max={2000} multiline disabled={disabled} onChange={(text) => update(selected.id, { text })} />}
                  {selected.kind === 'image' && <><ImagePicker label="Imagen del lienzo" value={selected.imageUrl} onChange={(imageUrl, asset) => update(selected.id, { imageUrl, alt: asset?.alt ?? selected.alt })} /><TextField label="Descripción de la imagen" value={selected.alt} max={160} disabled={disabled} onChange={(alt) => update(selected.id, { alt })} /></>}
                  {selected.kind !== 'shape' && <LinkField label="Enlace (opcional)" value={selected.href} onChange={(href) => update(selected.id, { href })} disabled={disabled} document={document} pageId={pageId} />}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">Color de texto<input aria-label="Color de texto" type="color" className="block h-9 w-full" value={selected.color} onChange={(e) => update(selected.id, { color: e.target.value })} /></label>
                    <label className="text-xs">Color de fondo<input aria-label="Color de fondo" type="color" className="block h-9 w-full" value={selected.background} onChange={(e) => update(selected.id, { background: e.target.value })} /></label>
                    <NumberField label="Tamaño de texto" value={canvasFontSize(selected, device)} min={10} max={160} onChange={(fontSize) => update(selected.id, device === 'mobile' ? { mobileFontSize: fontSize } : device === 'tablet' ? { tabletFontSize: fontSize } : { fontSize })} />
                    <NumberField label="Bordes redondos" value={selected.radius} min={0} max={100} onChange={(radius) => update(selected.id, { radius })} />
                    <NumberField label="Rotación (°)" value={selected.rotation} min={-180} max={180} onChange={(rotation) => update(selected.id, { rotation })} />
                    <NumberField label="Opacidad (%)" value={selected.opacity} min={0} max={100} onChange={(opacity) => update(selected.id, { opacity })} />
                  </div>
                  <SwitchRow label="Fondo transparente" checked={selected.transparent} onChange={(transparent) => update(selected.id, { transparent })} />
                  <label className="block text-xs">Alineación<select className="ml-2 rounded border bg-background p-2" value={selected.align} onChange={(e) => update(selected.id, { align: e.target.value as CanvasElement['align'] })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label>
                  <label className="block text-xs">Peso del texto<select className="ml-2 rounded border bg-background p-2" value={selected.fontWeight} onChange={(e) => update(selected.id, { fontWeight: e.target.value as CanvasElement['fontWeight'] })}>{(['400','500','600','700','800','900'] as const).map((n) => <option key={n}>{n}</option>)}</select></label>
                  <label className="block text-xs">Sombra<select className="ml-2 rounded border bg-background p-2" value={selected.shadow} onChange={(e) => update(selected.id, { shadow: e.target.value as CanvasElement['shadow'] })}><option value="none">Ninguna</option><option value="soft">Suave</option><option value="strong">Intensa</option></select></label>
                  <label className="block text-xs">Movimiento<select className="ml-2 rounded border bg-background p-2" value={selected.motion} onChange={(e) => update(selected.id, { motion: e.target.value as CanvasElement['motion'] })}>{CANVAS_MOTIONS.map((m) => <option value={m} key={m}>{MOTION_LABELS[m]}</option>)}</select></label>
                  <div className="grid grid-cols-2 gap-2"><NumberField label="Duración (ms)" value={selected.duration} min={200} max={10000} onChange={(duration) => update(selected.id, { duration })} /><NumberField label="Retraso (ms)" value={selected.delay} min={0} max={5000} onChange={(delay) => update(selected.id, { delay })} /></div>
                  <p className="text-xs text-muted-foreground">Los movimientos se desactivan si el visitante prefiere reducir animaciones.</p>
                </>}
              </div>
            </div>
          </>}
        </fieldset>
      </div>
  );
  return <details open={studioOpen} onToggle={(event) => setStudioOpen(event.currentTarget.open)} className="rounded-lg border border-border bg-card">
    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Estudio de lienzo · {canvas.elements.length} capas</summary>
    {expanded ? <Dialog open={expanded} onOpenChange={setExpanded}><DialogContent className="h-[90vh] max-w-[95vw] overflow-auto"><DialogHeader><DialogTitle>Estudio de lienzo</DialogTitle><DialogDescription>Compón tu sección con capas y ajustes por dispositivo.</DialogDescription></DialogHeader>{studio}</DialogContent></Dialog> : <div className="border-t border-border p-3">{studio}</div>}
  </details>;
}

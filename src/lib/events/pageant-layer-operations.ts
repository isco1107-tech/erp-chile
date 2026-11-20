import {
  CANVAS_MAX_ELEMENTS, canvasPosition, constrainPosition,
  type CanvasDevice, type CanvasElement, type CanvasPosition, type SiteCanvas,
} from '@/lib/web-sites/canvas';

export type LayerAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type LayerDistribution = 'horizontal' | 'vertical';
type Point = Pick<CanvasPosition, 'x' | 'y'>;

function selectedLayers(canvas: SiteCanvas, ids: readonly string[]) {
  const selection = new Set(ids);
  return canvas.elements.filter((layer) => selection.has(layer.id));
}

export function layerBounds(positions: readonly CanvasPosition[]): CanvasPosition | undefined {
  if (!positions.length) return undefined;
  const x = Math.min(...positions.map((position) => position.x));
  const y = Math.min(...positions.map((position) => position.y));
  return {
    x, y,
    width: Math.max(...positions.map((position) => position.x + position.width)) - x,
    height: Math.max(...positions.map((position) => position.y + position.height)) - y,
  };
}

/** Todas las capas reciben el mismo desplazamiento, incluso al topar con un borde. */
export function constrainLayerDelta(bounds: CanvasPosition, dx: number, dy: number) {
  return {
    dx: Math.max(-bounds.x, Math.min(100 - bounds.x - bounds.width, dx)),
    dy: Math.max(-bounds.y, Math.min(100 - bounds.y - bounds.height, dy)),
  };
}

function setPositions(canvas: SiteCanvas, device: CanvasDevice, points: Map<string, Point>): SiteCanvas {
  let changed = false;
  const elements = canvas.elements.map((layer) => {
    const point = points.get(layer.id);
    if (!point) return layer;
    const previous = canvasPosition(layer, device);
    const next = constrainPosition({ ...previous, ...point });
    if (Math.abs(next.x - previous.x) < 1e-8 && Math.abs(next.y - previous.y) < 1e-8) return layer;
    changed = true;
    return { ...layer, [device]: next };
  });
  return changed ? { ...canvas, elements } : canvas;
}

export function moveLayers(canvas: SiteCanvas, ids: readonly string[], device: CanvasDevice, dx: number, dy: number): SiteCanvas {
  const movable = selectedLayers(canvas, ids).filter((layer) => !layer.locked);
  return translateLayers(canvas, movable, device, dx, dy);
}

function translateLayers(canvas: SiteCanvas, layers: CanvasElement[], device: CanvasDevice, dx: number, dy: number) {
  const positions = layers.map((layer) => canvasPosition(layer, device));
  const bounds = layerBounds(positions);
  if (!bounds || !Number.isFinite(dx) || !Number.isFinite(dy)) return canvas;
  const delta = constrainLayerDelta(bounds, dx, dy);
  return setPositions(canvas, device, new Map(layers.map((layer, index) => [
    layer.id, { x: positions[index].x + delta.dx, y: positions[index].y + delta.dy },
  ])));
}

const CANVAS_BOUNDS = { x: 0, y: 0, width: 100, height: 100 };
const ALIGNMENT_AXES = {
  left: ['x', 'width', 0], center: ['x', 'width', 0.5], right: ['x', 'width', 1],
  top: ['y', 'height', 0], middle: ['y', 'height', 0.5], bottom: ['y', 'height', 1],
} as const;

export function alignLayers(canvas: SiteCanvas, ids: readonly string[], device: CanvasDevice, alignment: LayerAlignment): SiteCanvas {
  const layers = selectedLayers(canvas, ids);
  const locked = layers.filter((layer) => layer.locked);
  const anchors = locked.length ? locked : layers;
  const bounds = layers.length > 1 ? layerBounds(anchors.map((layer) => canvasPosition(layer, device))) : CANVAS_BOUNDS;
  if (!bounds) return canvas;
  const [axis, size, fraction] = ALIGNMENT_AXES[alignment];
  const points = new Map<string, Point>();
  for (const layer of layers) {
    if (layer.locked) continue;
    const position = canvasPosition(layer, device);
    points.set(layer.id, { ...position, [axis]: bounds[axis] + (bounds[size] - position[size]) * fraction });
  }
  return setPositions(canvas, device, points);
}

/** Iguala los espacios entre bordes y mantiene fijos los extremos y las capas bloqueadas. */
export function distributeLayers(canvas: SiteCanvas, ids: readonly string[], device: CanvasDevice, distribution: LayerDistribution): SiteCanvas {
  const [axis, size] = distribution === 'horizontal' ? ['x', 'width'] as const : ['y', 'height'] as const;
  const entries = selectedLayers(canvas, ids).map((layer) => ({ layer, position: canvasPosition(layer, device) }));
  if (entries.length < 3) return canvas;
  entries.sort((a, b) => a.position[axis] - b.position[axis]);
  const points = new Map<string, Point>();
  let first = 0;
  for (let last = 1; last < entries.length; last++) {
    if (!entries[last].layer.locked && last !== entries.length - 1) continue;
    const start = entries[first].position;
    const between = entries.slice(first + 1, last);
    const occupied = between.reduce((total, entry) => total + entry.position[size], 0);
    let cursor = start[axis] + start[size];
    const gap = (entries[last].position[axis] - cursor - occupied) / (last - first);
    for (const { layer, position } of between) {
      cursor += gap;
      points.set(layer.id, { ...position, [axis]: cursor });
      cursor += position[size];
    }
    first = last;
  }
  return setPositions(canvas, device, points);
}

export function deleteLayers(canvas: SiteCanvas, ids: readonly string[]): SiteCanvas {
  const selection = new Set(ids);
  const elements = canvas.elements.filter((layer) => layer.locked || !selection.has(layer.id));
  return elements.length === canvas.elements.length ? canvas : { ...canvas, elements };
}

export function copyLayers(canvas: SiteCanvas, ids: readonly string[]): CanvasElement[] {
  return structuredClone(selectedLayers(canvas, ids));
}

interface PasteOptions {
  device?: CanvasDevice;
  point?: Point;
  offset?: number;
}

export function pasteLayers(canvas: SiteCanvas, clipboard: readonly CanvasElement[], { device = 'desktop', point, offset = 2 }: PasteOptions = {}) {
  if (!clipboard.length || canvas.elements.length + clipboard.length > CANVAS_MAX_ELEMENTS) return undefined;
  const copies = clipboard.map((layer) => ({ ...structuredClone(layer), id: crypto.randomUUID() }));
  const bounds = layerBounds(copies.map((layer) => canvasPosition(layer, device)))!;
  const dx = point ? point.x - bounds.x : offset;
  const dy = point ? point.y - bounds.y : offset;
  const result = translateLayers({ ...canvas, enabled: true, elements: [...canvas.elements, ...copies] }, copies, device, dx, dy);
  return { canvas: result, ids: copies.map(({ id }) => id) };
}

export function duplicateLayers(canvas: SiteCanvas, ids: readonly string[], device: CanvasDevice = 'desktop') {
  return pasteLayers(canvas, selectedLayers(canvas, ids), { device });
}

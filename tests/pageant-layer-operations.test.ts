import { canvasElementSchema, canvasSchema, CANVAS_MAX_ELEMENTS, type CanvasElement } from '@/lib/web-sites/canvas';
import {
  alignLayers, copyLayers, deleteLayers, distributeLayers, duplicateLayers, moveLayers, pasteLayers,
} from '@/lib/events/pageant-layer-operations';

function layer(id: string, x: number, y: number, width = 10, height = 10, overrides: Partial<CanvasElement> = {}) {
  return canvasElementSchema.parse({ id, desktop: { x, y, width, height }, ...overrides });
}

function canvas(...elements: CanvasElement[]) {
  return canvasSchema.parse({ enabled: true, elements });
}

it('mueve la selección como un conjunto cuando un borde limita el arrastre', () => {
  const original = canvas(layer('a', 10, 20), layer('b', 75, 10), layer('c', 85, 0, 15, 10, { locked: true }));
  const moved = moveLayers(original, ['a', 'b', 'c'], 'desktop', 25, -50);
  expect(moved.elements.map(({ desktop: { x, y } }) => [x, y])).toEqual([[25, 10], [90, 0], [85, 0]]);
  expect(moved.elements[2]).toBe(original.elements[2]);
  expect(moveLayers(moved, ['a', 'b'], 'desktop', 10, -10)).toBe(moved);
  expect(moveLayers(original, ['missing'], 'desktop', 10, 10)).toBe(original);
});

it('ajusta posiciones heredadas solo en el dispositivo elegido, sin crear overrides si nada se mueve', () => {
  const original = canvas(layer('a', 10, 20, 10, 10, { tablet: { x: 30, y: 30, width: 35, height: 20 } }));
  const [moved] = moveLayers(original, ['a'], 'mobile', -1, 5).elements;
  expect(moved).toMatchObject({ desktop: original.elements[0].desktop, tablet: original.elements[0].tablet, mobile: { x: 9, y: 25, width: 10, height: 10 } });
  expect(moveLayers(original, ['a'], 'mobile', 0, 0)).toBe(original);
});

it('alinea al lienzo o a la selección y usa las capas bloqueadas como referencia', () => {
  const original = canvas(layer('a', 10, 10, 10, 8), layer('b', 30, 30, 30, 10));
  expect(alignLayers(original, ['a'], 'mobile', 'center').elements[0].mobile?.x).toBe(45);
  expect(alignLayers(original, ['a', 'b'], 'mobile', 'right').elements.map((entry) => (entry.mobile ?? entry.desktop).x)).toEqual([50, 30]);
  expect(alignLayers(original, ['a', 'b'], 'desktop', 'middle').elements.map((entry) => entry.desktop.y)).toEqual([21, 20]);
  const protectedCanvas = canvas(original.elements[0], { ...original.elements[1], locked: true });
  const aligned = alignLayers(protectedCanvas, ['a', 'b'], 'desktop', 'top');
  expect(aligned.elements[0].desktop.y).toBe(30);
  expect(aligned.elements[1]).toBe(protectedCanvas.elements[1]);
  expect(alignLayers(protectedCanvas, ['b'], 'desktop', 'left')).toBe(protectedCanvas);
});

it('distribuye espacios entre bordes de diferentes tamaños, conserva el orden de apilado y respeta las anclas', () => {
  const original = canvas(
    layer('b', 10, 12, 8), layer('e', 85, 0), layer('a', 0, 30, 10),
    layer('c', 40, 20, 20, 10, { locked: true }), layer('d', 64, 5, 10),
  );
  const ids = original.elements.map(({ id }) => id);
  const distributed = distributeLayers(original, ids, 'desktop', 'horizontal');
  expect(distributed.elements.map(({ id, desktop: { x } }) => [id, x])).toEqual([['b', 21], ['e', 85], ['a', 0], ['c', 40], ['d', 67.5]]);
  expect(distributeLayers(original, ids.slice(0, 2), 'desktop', 'horizontal')).toBe(original);
  const vertical = distributeLayers(original, ['a', 'b', 'e'], 'mobile', 'vertical');
  expect(vertical.elements[0].mobile).toEqual({ x: 10, y: 15, width: 8, height: 10 });
  expect(vertical.elements[0].desktop).toBe(original.elements[0].desktop);
});

it('copia y pega entre lienzos con identificadores nuevos, formato y las posiciones de cada dispositivo', () => {
  const original = canvas(
    layer('a', 1, 2, 20, 10, { text: 'Título', richText: [{ text: 'Título', bold: true }] }),
    layer('b', 31, 2, 10, 10, { kind: 'image', imageUrl: '/imagen.webp', mobile: { x: 10, y: 20, width: 15, height: 15 } }),
  );
  const clipboard = copyLayers(original, ['b', 'a', 'a', 'eliminada']);
  expect(clipboard.map(({ id }) => id)).toEqual(['a', 'b']);
  expect(clipboard[0].richText).not.toBe(original.elements[0].richText);
  const target = canvasSchema.parse({ enabled: false, elements: [layer('b', 1, 1)] });
  const pasted = pasteLayers(target, clipboard, { device: 'mobile', point: { x: 98, y: 99 } })!;
  expect(pasted.canvas.enabled).toBe(true);
  expect(pasted.ids).toHaveLength(2);
  expect(new Set(['a', 'b', ...pasted.ids]).size).toBe(4);
  const [existing, a, b] = pasted.canvas.elements;
  expect(existing).toBe(target.elements[0]);
  expect(a).toMatchObject({ id: pasted.ids[0], desktop: original.elements[0].desktop, mobile: { x: 76, y: 67 }, richText: [{ text: 'Título', bold: true }] });
  expect(b).toMatchObject({ id: pasted.ids[1], desktop: original.elements[1].desktop, mobile: { x: 85, y: 85 }, imageUrl: '/imagen.webp' });
  expect(canvasSchema.safeParse(pasted.canvas).success).toBe(true);
});

it('duplica la selección completa en un solo paso y rechaza un pegado que excede el límite', () => {
  const original = canvas(layer('a', 10, 10), layer('b', 40, 10));
  const result = duplicateLayers(original, ['a', 'b'], 'tablet')!;
  expect(result.canvas.elements.slice(2).map((entry) => entry.tablet?.x)).toEqual([12, 42]);
  expect(result.canvas.elements.slice(2).map((entry) => entry.desktop.x)).toEqual([10, 40]);
  const nearlyFull = canvas(...Array.from({ length: CANVAS_MAX_ELEMENTS - 1 }, (_, index) => layer(String(index), 0, 0)));
  expect(pasteLayers(nearlyFull, original.elements)).toBeUndefined();
  expect(nearlyFull.elements).toHaveLength(CANVAS_MAX_ELEMENTS - 1);
  expect(duplicateLayers(original, ['desconocida'])).toBeUndefined();
});

it('elimina de una vez las capas seleccionadas editables', () => {
  const original = canvas(layer('a', 0, 0), layer('b', 0, 0, 10, 10, { locked: true }), layer('c', 0, 0));
  expect(deleteLayers(original, ['c', 'a', 'b']).elements).toEqual([original.elements[1]]);
  expect(deleteLayers(original, ['b'])).toBe(original);
});

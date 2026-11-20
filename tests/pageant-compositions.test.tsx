import { renderToStaticMarkup } from 'react-dom/server';
import { CanvasContent } from '@/components/web-sites/site/CanvasScene';
import { createPageantComposition, pageantCompositions, placePageantComposition } from '@/lib/events/pageant-compositions';
import { pageantDesignForDisplay, pageantDesignImageUrls, pageantSiteDesignSchema } from '@/lib/events/pageant-site-design';
import { CANVAS_DEVICES, canvasElementSchema, canvasElementStyle, canvasPositionSchema, canvasSchema } from '@/lib/web-sites/canvas';
import { layerBounds } from '@/lib/events/pageant-layer-operations';

const presets = pageantCompositions('#b89a5c');

it('inserta una composición de varias capas con espacio propio y nuevos identificadores cada vez', () => {
  const canvas = canvasSchema.parse({});
  const preset = presets[0];
  const inserted = placePageantComposition(canvas, preset, 'desktop')!;
  expect(inserted.canvas.elements.map(({ text }) => text)).toEqual(preset.elements.map(({ text }) => text));
  expect(inserted.canvas.elements[0].desktop).toEqual(preset.elements[0].desktop);
  const repeated = placePageantComposition(inserted.canvas, preset, 'mobile')!;
  expect(new Set(repeated.canvas.elements.map(({ id }) => id)).size).toBe(preset.elements.length * 2);
});

it('encuadra el conjunto al insertarlo en una sección alta y lo mantiene dentro en todos los dispositivos', () => {
  const canvas = canvasSchema.parse({});
  const result = placePageantComposition(canvas, presets[2], 'desktop', { x: 92, y: 67, canvasHeight: 900 })!;
  for (const device of CANVAS_DEVICES) {
    const positions = result.canvas.elements.map((layer) => layer[device]!);
    expect(positions.every((pos) => canvasPositionSchema.safeParse(pos).success)).toBe(true);
    const bounds = layerBounds(positions)!;
    expect(bounds.y).toBeCloseTo(67);
    expect(bounds.height).toBeLessThan(30);
  }
});

it('guarda solo las capas elegidas y mantiene las composiciones privadas', () => {
  const photo = 'https://example.cl/logo.png';
  const canvas = canvasSchema.parse({ elements: [
    { id: 'foto', kind: 'image', locked: true, imageUrl: photo },
    { id: 'otra', text: 'Capa aparte' },
  ] });
  const composition = createPageantComposition('Mi diseño', canvas, ['foto'])!;
  const parsed = pageantSiteDesignSchema.parse({ compositions: [composition] });
  expect(parsed.compositions?.[0].elements[0]).toMatchObject({ id: 'foto', kind: 'image', locked: false, imageUrl: photo });
  expect(pageantDesignForDisplay(parsed)).not.toHaveProperty('compositions');
  expect(pageantDesignImageUrls(parsed)).toEqual([photo]);
});

it('aplica el mismo encuadre y acabado a una capa heredada o nueva sin aceptar CSS libre', () => {
  const base = { id: 'logo', kind: 'image', imageUrl: 'https://example.cl/foto.png' } as const;
  const layer = canvasElementSchema.parse({
    ...base, imageFrame: { fit: 'contain', x: 70, y: 30, zoom: 155 },
    transparent: false, gradient: { color: '#954d75', angle: 90 }, border: { color: '#ab8849', width: 3 },
    lineHeight: 1.6, letterSpacing: 0.12,
  });
  const photo = renderToStaticMarkup(<CanvasContent element={layer} />);
  expect(photo).toContain('object-fit:contain;object-position:70% 30%;transform-origin:70% 30%;scale:1.55');
  expect(renderToStaticMarkup(<CanvasContent element={canvasElementSchema.parse(base)} />)).toContain('object-fit:cover;object-position:50% 50%');
  expect(canvasElementStyle(layer)).toMatchObject({
    backgroundImage: 'linear-gradient(90deg, #ffffff, #954d75)',
    border: '3px solid #ab8849',
    lineHeight: 1.6,
    letterSpacing: '0.12em',
  });
  expect(canvasElementSchema.safeParse({ ...base, imageFrame: { x: 101 } }).success).toBe(false);
  expect(canvasElementSchema.safeParse({ ...base, gradient: { color: 'url(https://example.cl)' } }).success).toBe(false);
});

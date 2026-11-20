jest.mock('@/lib/email/mailer', () => ({ getAppUrl: () => 'https://example.cl' }));
jest.mock('jose', () => ({ jwtVerify: jest.fn(), SignJWT: jest.fn() }));

import { renderToStaticMarkup } from 'react-dom/server';
import { PageantSiteDocument } from '@/components/public/pageant/PageantSiteDocument';
import { pageantBlockPlacement, pageantDesignImageUrls, pageantSiteDesignSchema, placePageantBlock, resolvePageantDesignLayout } from '@/lib/events/pageant-site-design';
import { designLayout } from '@/lib/events/pageant-design-ops';
import { baseSite } from '../scripts/responsive/fixtures';
import { snapPageantCanvas } from '@/lib/events/pageant-studio';

const blocks = [
  { id: 'primer-bloque', type: 'text', heading: 'Información para delegaciones' },
  { id: 'segundo-bloque', type: 'text', heading: 'Transporte para la gala' },
  { id: 'tercer-bloque', type: 'text', heading: 'Cierre de la edición' },
];

it('publica las secciones en sus posiciones tras guardar y mantiene la ubicación de los diseños anteriores', () => {
  const initial = pageantSiteDesignSchema.parse({ enabled: true, placement: 'afterHero', blocks });
  const moved = placePageantBlock(initial, initial.blocks[1], { slot: 'gala' });
  const reordered = placePageantBlock(moved, initial.blocks[2], { slot: 'gala', beforeId: 'segundo-bloque' });
  const saved = pageantSiteDesignSchema.parse(JSON.parse(JSON.stringify(reordered)));
  expect(pageantBlockPlacement(saved, 'primer-bloque')).toBe('afterHero');

  const html = renderToStaticMarkup(<PageantSiteDocument site={baseSite({ creative: saved })} />);
  const order = ['id="inicio"', 'data-block-id="primer-bloque"', 'id="certamen"', 'id="gala"', 'data-block-id="tercer-bloque"', 'data-block-id="segundo-bloque"', 'id="preguntas"'];
  const indexes = order.map((part) => html.indexOf(part));
  expect(indexes.every((index) => index >= 0)).toBe(true);
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  expect(html.match(/\.ws-root\{font-family/g)).toHaveLength(1);
});

it('valida los destinos y descarta posiciones de secciones que ya no existen', () => {
  const valid = pageantSiteDesignSchema.parse({ blocks, blockPlacements: { 'primer-bloque': 'gala', eliminada: 'before' } });
  expect(valid.blockPlacements).toEqual({ 'primer-bloque': 'gala' });
  expect(pageantSiteDesignSchema.safeParse({ blocks, blockPlacements: { 'primer-bloque': 'desconocido' } }).success).toBe(false);
});

it('cada editor interpreta las ubicaciones del otro sin volver al orden inicial', () => {
  const fromLayers = pageantSiteDesignSchema.parse({
    enabled: true, blocks, placement: 'afterHero', blockPlacements: { 'segundo-bloque': 'gala' },
  });
  const order = designLayout(fromLayers);
  expect(order[order.findIndex((item) => item.id === 'gala') + 1]?.id).toBe('segundo-bloque');
  const fromSections = pageantSiteDesignSchema.parse({
    ...fromLayers,
    layout: [{ kind: 'section', id: 'gala' }, { kind: 'block', id: 'segundo-bloque' }, { kind: 'section', id: 'inicio' }],
  });
  const merged = placePageantBlock(fromSections, fromSections.blocks[0], { slot: 'gala', beforeId: 'segundo-bloque' });
  const items = resolvePageantDesignLayout(merged).items;
  expect(items.filter(({ kind }) => kind === 'section')).toEqual(resolvePageantDesignLayout(fromSections).items.filter(({ kind }) => kind === 'section'));
  const second = items.findIndex(({ id }) => id === 'segundo-bloque');
  expect(items[second - 1]?.id).toBe('primer-bloque');
  expect(items.findIndex(({ id }) => id === 'gala')).toBeLessThan(second);
});

it('mantiene las capas de formato sobre la sección que les corresponde y recoge las imágenes del diseño', () => {
  const design = pageantSiteDesignSchema.parse({
    enabled: true,
    overlays: {
      gala: { enabled: true, elements: [
        { id: 'marca', kind: 'image', imageUrl: 'https://example.cl/marca.webp' },
        { id: 'caption', kind: 'text', text: 'Fecha especial', richText: [{ text: 'Fecha ' }, { text: 'especial', bold: true, italic: true }] },
      ] },
      resultados: { enabled: true, elements: [{ id: 'pending', kind: 'text', text: 'Capa de la coronación' }] },
    },
  });

  const html = renderToStaticMarkup(<PageantSiteDocument site={baseSite({ creative: design })} />);
  expect(html).toMatch(/id="gala"[^>]*>.*?data-pageant-overlay="gala"/);
  expect(html).toMatch(/font-weight:900;font-style:italic">especial/);
  expect(html).not.toContain('Capa de la coronación');
  expect(pageantDesignImageUrls(design)).toEqual(['https://example.cl/marca.webp']);
  expect(renderToStaticMarkup(<PageantSiteDocument site={baseSite({ creative: { ...design, enabled: false } })} />)).not.toContain('data-pageant-overlay');
});

it('rechaza formato inconsistente con el texto de la capa', () => {
  expect(pageantSiteDesignSchema.safeParse({
    overlays: { inicio: { elements: [{ id: 'test', text: 'Hola', richText: [{ text: 'Distinto', bold: true }] }] } },
  }).success).toBe(false);
});

it('vincula una pieza del diseño base a una capa, incluso en otra sección, y elimina vínculos huérfanos', () => {
  const design = pageantSiteDesignSchema.parse({
    enabled: true,
    relocated: { 'inicio.title': 'moved-title', 'inicio.tagline': 'removed' },
    overlays: { gala: { enabled: true, elements: [{ id: 'moved-title', text: 'El nuevo título', headingLevel: 1 }] } },
  });
  expect(design.relocated).toEqual({ 'inicio.title': 'moved-title' });
  const html = renderToStaticMarkup(<PageantSiteDocument site={baseSite({ creative: design })} />);
  expect(html).toContain('body:has([data-pageant-layer="moved-title"]) [data-pageant-item="inicio.title"]{visibility:hidden!important}');
  expect(html).toMatch(/data-pageant-layer="moved-title"[^>]+role="heading" aria-level="1"/);
  expect(pageantSiteDesignSchema.safeParse({ relocated: { 'invalid"': 'moved-title' } }).success).toBe(false);
});

it('ajusta una capa a bordes compartidos sin modificar sus dimensiones', () => {
  const result = snapPageantCanvas(
    { x: 19.8, y: 39.7, width: 20, height: 10 },
    [{ x: 20, y: 50, width: 10, height: 20 }],
    0.5, 0.5,
  );
  expect(result).toEqual({ position: { x: 20, y: 40, width: 20, height: 10 }, guideX: 20, guideY: 50 });
});

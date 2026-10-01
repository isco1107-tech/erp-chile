import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { composePoster, type PosterDeps } from '@/lib/posters/compose';
import { POSTER_FORMATS } from '@/lib/posters/formats';
import { POSTER_PIECES, pieceAvailability } from '@/lib/posters/pieces';
import { POSTER_STYLES } from '@/lib/posters/styles';
import { posterOverridesSchema } from '@/lib/posters/overrides';
import { posterSite } from './helpers/poster-site';

/**
 * Cada pieza, en cada estilo y formato, compuesta con fuentes reales (la de
 * Next, sin red) y revisada con las reglas del renderizador (satori): una
 * propiedad CSS en `undefined` o `NaN` lo hace caer, y un `<div>` con varios
 * hijos sin `display: flex` también. El dibujo real a PNG se revisó a ojo en
 * el desarrollo (hojas de contacto de las 150 combinaciones, con datos
 * incómodos); acá se fija la estructura para que un cambio no la rompa.
 */

const font = readFileSync(join(process.cwd(), 'node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf'));
const fontData = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
// PNG de 1×1 válido: el contenido de la foto no importa para la estructura.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const loadPhoto = jest.fn(async () => PIXEL);
const deps: PosterDeps = { loadFont: async () => fontData, loadPhoto };
const NOW = new Date('2026-10-01T15:00:00Z');
const PLACE = { origin: 'https://app.test', siteUrl: 'https://app.test/certamen/miss-sur' };

interface Problem {
  path: string;
  issue: string;
}

/** Expande los componentes (funciones puras) hasta los nodos que ve el renderizador y revisa cada uno. */
function inspect(node: ReactNode, path: string, problems: Problem[], texts: string[]): void {
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') {
    texts.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => inspect(child, `${path}[${index}]`, problems, texts));
    return;
  }
  if (!isValidElement(node)) return;
  const element = node as ReactElement<{ children?: ReactNode; style?: Record<string, unknown> }>;
  if (element.type === Fragment) return inspect(element.props.children, path, problems, texts);
  if (typeof element.type === 'function') {
    const render = element.type as (props: unknown) => ReactNode;
    return inspect(render(element.props), `${path}>${render.name}`, problems, texts);
  }
  const tag = String(element.type);
  const style = element.props.style ?? {};
  for (const [key, value] of Object.entries(style)) {
    if (value === undefined) problems.push({ path: `${path}>${tag}`, issue: `${key} es undefined` });
    if (typeof value === 'number' && !Number.isFinite(value)) problems.push({ path: `${path}>${tag}`, issue: `${key} no es finito (${value})` });
  }
  if (typeof style.fontSize === 'number' && style.fontSize < 6) problems.push({ path: `${path}>${tag}`, issue: `texto de ${style.fontSize}px` });
  const children = ([] as ReactNode[]).concat(element.props.children ?? []).filter((child) => child !== null && child !== undefined && child !== false);
  if (tag === 'div' && children.length > 1 && style.display !== 'flex' && style.display !== 'none') {
    problems.push({ path: `${path}>${tag}`, issue: 'div con varios hijos sin display:flex' });
  }
  if (tag === 'svg') return;
  inspect(element.props.children, `${path}>${tag}`, problems, texts);
}

describe('composePoster', () => {
  const site = posterSite({ results: [{ rank: 1, name: 'Camila Rojas', number: 1, representing: 'Temuco', photoUrl: 'https://x.public.blob.vercel-storage.com/c1.jpg' }] });
  const availability = pieceAvailability(site, NOW);

  for (const style of POSTER_STYLES) {
    for (const piece of POSTER_PIECES) {
      it(`${style} · ${piece}: estructura válida en los ${POSTER_FORMATS.length} formatos`, async () => {
        expect(availability[piece].available).toBe(true);
        for (const format of POSTER_FORMATS) {
          const build = await composePoster(site, { piece, style, format, accent: null, candidateId: null, note: 'Casting el sábado 18', qr: true }, PLACE, deps, NOW);
          if (!build.ok) throw new Error(build.error);
          const problems: Problem[] = [];
          const texts: string[] = [];
          inspect(build.element, `${style}/${piece}/${format}`, problems, texts);
          expect(problems).toEqual([]);
          expect(texts.join(' ').length).toBeGreaterThan(10);
          // Recortar todo el lienzo (`overflow: hidden`) multiplicaba por cinco el tiempo de dibujo: el PNG ya se corta solo.
          const root = build.element as ReactElement<{ style?: Record<string, unknown> }>;
          expect(root.props.style?.overflow).toBeUndefined();
          expect(root.props.style).toMatchObject({ width: build.width, height: build.height });
        }
      });
    }
  }

  const IMG = 'https://x.public.blob.vercel-storage.com/pageant-posters/co1/p1-1.png';
  const custom = posterOverridesSchema.parse({
    texts: { eyebrow: '¡Último llamado!', headline: 'Casting abierto en Temuco', subline: 'Una bajada propia', cta: 'Inscríbete', url: 'misssur.cl', note: 'Casting presencial el sábado 18 en el Hotel Dreams, de 10:00 a 14:00 h, trae tu carnet' },
    facts: [{ label: 'Casting', value: 'Sábado 18' }, { label: 'Lugar', value: 'Hotel Dreams' }],
    list: { title: 'Requisitos', items: ['Carnet', 'Foto de cuerpo entero', 'Autorización si eres menor'] },
    hidden: ['contact'],
    photoUrl: IMG,
    photoPosition: 'top',
    logoUrl: IMG,
    sponsorLogos: Array(8).fill(IMG),
    titleScale: 1.3,
  });

  for (const style of POSTER_STYLES) {
    it(`${style}: personalización completa con estructura válida en todos los formatos`, async () => {
      for (const format of POSTER_FORMATS) {
        for (const piece of ['convocatoria', 'candidata', 'gala'] as const) {
          const build = await composePoster(site, { piece, style, format, accent: null, candidateId: null, note: null, qr: true, overrides: custom }, PLACE, deps, NOW);
          if (!build.ok) throw new Error(build.error);
          const problems: Problem[] = [];
          const texts: string[] = [];
          inspect(build.element, `${style}/${piece}/${format}/custom`, problems, texts);
          expect(problems).toEqual([]);
          expect(texts.join(' ')).toContain('¡ÚLTIMO LLAMADO!'.slice(0, 3));
          expect(Array.isArray(build.omitted)).toBe(true);
        }
      }
    });
  }

  it('las imágenes propias se piden como logo (con transparencia) o foto', async () => {
    loadPhoto.mockClear();
    await composePoster(site, { piece: 'convocatoria', style: 'gala', format: 'feed', accent: null, candidateId: null, note: null, qr: false, overrides: custom }, PLACE, deps, NOW);
    const kinds = loadPhoto.mock.calls.map((call) => (call as unknown[])[2]);
    expect(kinds.filter((kind) => kind === 'logo')).toHaveLength(9);
    expect(loadPhoto.mock.calls.some((call) => (call as unknown[])[0] === IMG && (call as unknown[])[2] === 'photo')).toBe(true);
  });

  it('el titular y los datos reales llegan al dibujo', async () => {
    const build = await composePoster(site, { piece: 'gala', style: 'gala', format: 'feed', accent: 'rose', candidateId: null, note: null, qr: false }, PLACE, deps, NOW);
    if (!build.ok) throw new Error(build.error);
    const texts: string[] = [];
    inspect(build.element, 'gala', [], texts);
    const all = texts.join(' | ');
    expect(all).toContain('Temuco');
    expect(all).toContain('Teatro Municipal');
    expect(all).toContain('Desde $15.000');
    expect(all).not.toContain('IVA');
    expect(build.filename).toBe('afiche-miss-sur-gala-feed.png');
    expect(build.width).toBe(1080);
    expect(build.height).toBe(1350);
  });

  it('una pieza no disponible responde 409 con el motivo', async () => {
    const build = await composePoster(posterSite({ voting: null }), { piece: 'votacion', style: 'gala', format: 'feed', accent: null, candidateId: null, note: null, qr: null }, PLACE, deps, NOW);
    expect(build).toEqual({ ok: false, status: 409, error: 'La votación del público no está abierta.' });
  });

  it('sin fuentes (Google Fonts caído) igual compone, con medida aproximada', async () => {
    const build = await composePoster(site, { piece: 'convocatoria', style: 'impacto', format: 'story', accent: null, candidateId: null, note: null, qr: null }, PLACE, { ...deps, loadFont: async () => null }, NOW);
    if (!build.ok) throw new Error(build.error);
    expect(build.fonts).toEqual([]);
    const problems: Problem[] = [];
    inspect(build.element, 'sin-fuentes', problems, []);
    expect(problems).toEqual([]);
  });

  it('una foto que falla no rompe el afiche', async () => {
    const failing: PosterDeps = { ...deps, loadPhoto: async () => Promise.reject(new Error('caída')) };
    const build = await composePoster(site, { piece: 'candidatas', style: 'editorial', format: 'square', accent: null, candidateId: null, note: null, qr: null }, PLACE, failing, NOW);
    expect(build.ok).toBe(true);
  });

  it('el QR por defecto sigue al formato: apagado en feed, encendido en impresión', async () => {
    const qrIn = async (format: 'feed' | 'print') => {
      const build = await composePoster(site, { piece: 'convocatoria', style: 'gala', format, accent: null, candidateId: null, note: null, qr: null }, PLACE, deps, NOW);
      if (!build.ok) throw new Error(build.error);
      const texts: string[] = [];
      inspect(build.element, format, [], texts);
      return texts.join(' ').includes('ESCANEA');
    };
    expect(await qrIn('feed')).toBe(false);
    expect(await qrIn('print')).toBe(true);
  });
});

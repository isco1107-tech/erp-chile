import QRCode from 'qrcode';
import type { PublicAccentKey } from '@/modules/projects/schema';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';
import { approximateMeasurer, measurerFor, parseFontMetrics, type Measurer } from './font-metrics';
import { POSTER_FORMAT_SPECS, type PosterFormat } from './formats';
import { NIGHT, POSTER_PALETTES } from './palettes';
import { applyPosterOverrides, type PosterOverrides } from './overrides';
import { buildPosterContent, pieceAvailability, posterGlyphs, type PosterContent, type PosterPiece } from './pieces';
import { renderPoster, type PosterImages, type PosterTypeKit } from './render';
import { FONT_ROLES, ROLE_FAMILY, STYLE_FONTS, type FontRole, type PosterStyle } from './styles';

/**
 * Composición completa de un afiche a partir del certamen ya ensamblado:
 * contenido → fuentes (y sus métricas) → fotos → QR → elemento. La descarga
 * de fuentes y fotos llega inyectada, para que el servidor use sus reglas
 * (solo nuestro almacenamiento, fotos achicadas) y las pruebas no salgan a
 * la red.
 */

export interface PosterRequest {
  piece: PosterPiece;
  style: PosterStyle;
  format: PosterFormat;
  /** `null` = el acento configurado en el micrositio. */
  accent: PublicAccentKey | null;
  candidateId: string | null;
  note: string | null;
  /** `null` = lo que corresponda al formato (encendido en pantalla e impresión). */
  qr: boolean | null;
  /** Personalización del estudio (ya validada); sin ella, todo automático. */
  overrides?: PosterOverrides;
}

export interface PosterFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700 | 800;
  style: 'normal' | 'italic';
}

export type PosterBuild =
  | { ok: true; element: ReturnType<typeof renderPoster>; width: number; height: number; fonts: PosterFont[]; filename: string; omitted: string[] }
  | { ok: false; status: 400 | 404 | 409; error: string };

export interface PosterDeps {
  loadFont(family: string, glyphs: string, variant: { weight: number; italic: boolean }): Promise<ArrayBuffer | null>;
  /**
   * Imagen como `data:` URL, achicada a `maxSide`; `null` si no se puede usar.
   * `logo` conserva la transparencia (PNG); `photo` puede ir en JPEG.
   */
  loadPhoto(url: string, maxSide: number, kind: 'photo' | 'logo'): Promise<string | null>;
  onFontError?(error: unknown, family: string): void;
}

export interface PosterPlace {
  /** Origen público de los enlaces (dominio propio verificado o la plataforma). */
  origin: string;
  /** Dirección del micrositio; `null` si aún no tiene una usable. */
  siteUrl: string | null;
}

async function loadFonts(style: PosterStyle, glyphs: string, deps: PosterDeps): Promise<{ type: PosterTypeKit; fonts: PosterFont[] }> {
  const specs = STYLE_FONTS[style];
  const downloads = await Promise.all(FONT_ROLES.map((role) => deps.loadFont(specs[role].family, glyphs, { weight: specs[role].weight, italic: specs[role].italic })));
  const measure = {} as Record<FontRole, Measurer>;
  const font = {} as PosterTypeKit['font'];
  const fonts: PosterFont[] = [];
  FONT_ROLES.forEach((role, index) => {
    const spec = specs[role];
    const data = downloads[index];
    font[role] = { family: ROLE_FAMILY[role], weight: spec.weight, italic: spec.italic };
    // Sin la fuente se dibuja con la de reserva: una medida generosa evita que algo se salga.
    measure[role] = approximateMeasurer(0.62);
    if (!data) return;
    try {
      measure[role] = measurerFor(parseFontMetrics(data));
      const fontStyle = spec.italic ? 'italic' : 'normal';
      if (!fonts.some((f) => f.name === ROLE_FAMILY[role] && f.weight === spec.weight && f.style === fontStyle)) {
        fonts.push({ name: ROLE_FAMILY[role], data, weight: spec.weight as PosterFont['weight'], style: fontStyle });
      }
    } catch (error) {
      deps.onFontError?.(error, spec.family);
    }
  });
  return { type: { measure, font }, fonts };
}

export const MAX_MOSAIC_PHOTOS = 30;

async function loadImages(content: PosterContent, format: PosterFormat, deps: PosterDeps): Promise<PosterImages> {
  const { width, height } = POSTER_FORMAT_SPECS[format];
  const big = Math.round(Math.max(width, height) * 1.1);
  const hero = content.hero;
  const tileUrls = hero.kind === 'mosaic' ? hero.tiles.slice(0, MAX_MOSAIC_PHOTOS).map((tile) => tile.photoUrl) : [];
  const tileSide = tileUrls.length > 12 ? 380 : tileUrls.length > 4 ? 540 : 800;
  const load = (url: string | null, side: number, kind: 'photo' | 'logo' = 'photo') => (url ? deps.loadPhoto(url, side, kind).catch(() => null) : Promise.resolve(null));
  const [background, portrait, logo, sponsorLogos, tiles] = await Promise.all([
    load(content.backgroundUrl, big),
    load(hero.kind === 'portrait' ? hero.photoUrl : null, big),
    load(content.decor.logoUrl, 600, 'logo'),
    Promise.all(content.decor.sponsorLogos.map((url) => load(url, 400, 'logo'))),
    Promise.all(tileUrls.map((url) => load(url, tileSide))),
  ]);
  return { background, portrait, tiles, logo, sponsorLogos: sponsorLogos.filter((src): src is string => Boolean(src)) };
}

/** QR en SVG (vectorial: nítido también impreso, y sin codificar un PNG en cada afiche). */
async function qrDataUrl(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: NIGHT.bottom, light: '#ffffff' } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function composePoster(site: PublicPageantSite, request: PosterRequest, place: PosterPlace, deps: PosterDeps, now: Date): Promise<PosterBuild> {
  const qr = request.qr ?? POSTER_FORMAT_SPECS[request.format].qrByDefault;
  const automatic = buildPosterContent(site, { piece: request.piece, candidateId: request.candidateId, note: request.note, qr, origin: place.origin, siteUrl: place.siteUrl, now });
  const content = automatic && request.overrides ? applyPosterOverrides(automatic, request.overrides) : automatic;
  if (!content) {
    const availability = pieceAvailability(site, now)[request.piece];
    return { ok: false, status: 409, error: availability.available ? 'Esta pieza no está disponible' : availability.reason };
  }

  const [{ type, fonts }, images, qrImage] = await Promise.all([
    loadFonts(request.style, posterGlyphs(content), deps),
    loadImages(content, request.format, deps),
    content.qr ? qrDataUrl(content.qr.url) : Promise.resolve(null),
  ]);

  const { width, height } = POSTER_FORMAT_SPECS[request.format];
  const report = { omitted: [] as string[] };
  const element = renderPoster({ content, format: request.format, style: request.style, palette: POSTER_PALETTES[request.accent ?? site.accent], type, images, qrDataUrl: qrImage, report });
  const slug = site.slug === 'vista-previa' ? 'certamen' : site.slug;
  return { ok: true, element, width, height, fonts, filename: `afiche-${slug}-${request.piece}-${request.format}.png`, omitted: report.omitted };
}

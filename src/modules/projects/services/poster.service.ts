import 'server-only';

import { getAppUrl } from '@/lib/email/mailer';
import { fetchGoogleFontSubset } from '@/lib/images/subset-font';
import { composePoster, type PosterBuild, type PosterDeps, type PosterRequest } from '@/lib/posters/compose';
import { captureException } from '@/lib/observability';
import { blobPathnameStartsWith, isAllowedBlobUrl } from '@/lib/security/blob-url';
import { overrideImages, type PosterOverrides } from '@/lib/posters/overrides';
import { getPageantSitePreview, type PublicPageantSite } from './public-site.service';

/**
 * Afiches del certamen (ver `src/lib/posters/`): este servicio pone lo que
 * toca la red y la base de datos — el certamen ensamblado como lo ve el
 * público, las fuentes de Google Fonts y las fotos de nuestro almacenamiento.
 */

/** Dónde vive el sitio público (`null` si aún no tiene una dirección usable). */
export function posterSiteUrl(site: Pick<PublicPageantSite, 'slug' | 'customDomain'>): string | null {
  // `vista-previa` es el marcador de "sin dirección pública todavía" (ver `getPageantSitePreview`).
  if (site.slug === 'vista-previa') return null;
  return site.customDomain ? `https://${site.customDomain}` : `${getAppUrl()}/certamen/${site.slug}`;
}

/**
 * Imagen achicada para que el renderizador no cargue originales de varios MB
 * (un mosaico de 30 candidatas sería lentísimo): las fotos en JPEG, los logos
 * en PNG para conservar la transparencia. Solo URLs de nuestro almacenamiento:
 * el servidor nunca sale a buscar una dirección arbitraria guardada en un campo.
 */
async function loadPhoto(url: string, maxSide: number, kind: 'photo' | 'logo'): Promise<string | null> {
  if (!isAllowedBlobUrl(url)) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  try {
    const { default: sharp } = await import('sharp');
    const resized = sharp(bytes).rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    if (kind === 'logo') return `data:image/png;base64,${(await resized.png().toBuffer()).toString('base64')}`;
    return `data:image/jpeg;base64,${(await resized.jpeg({ quality: 86 }).toBuffer()).toString('base64')}`;
  } catch {
    // Sin sharp (o una imagen que no sabe leer): el original, si el renderizador lo soporta.
    const type = response.headers.get('content-type') ?? '';
    return /^image\/(jpeg|png)/.test(type) ? `data:${type};base64,${bytes.toString('base64')}` : null;
  }
}

/** Carpeta donde el estudio sube las imágenes de afiches de una empresa (ver `cover-upload`). */
export function posterImagePrefix(companyId: string): string {
  return `pageant-posters/${companyId}/`;
}

/** Toda imagen propia de un afiche tiene que haberla subido esta misma empresa desde el estudio. */
export function posterImagesProblem(companyId: string, overrides: PosterOverrides): string | null {
  const foreign = overrideImages(overrides).some((url) => !isAllowedBlobUrl(url) || !blobPathnameStartsWith(url, posterImagePrefix(companyId)));
  return foreign ? 'Las imágenes del afiche deben subirse desde el estudio de afiches' : null;
}

const deps: PosterDeps = {
  loadFont: (family, glyphs, variant) => fetchGoogleFontSubset(family, glyphs, variant),
  loadPhoto,
  onFontError: (error, family) => captureException(error, { module: 'proyectos', extra: { reason: 'poster-font', family } }),
};

export async function buildPosterImage(companyId: string, projectId: string, request: PosterRequest, now: Date = new Date()): Promise<PosterBuild> {
  if (request.overrides) {
    const problem = posterImagesProblem(companyId, request.overrides);
    if (problem) return { ok: false, status: 400, error: problem };
  }
  const site = await getPageantSitePreview(companyId, projectId);
  if (!site) return { ok: false, status: 404, error: 'Certamen no encontrado' };
  const origin = site.customDomain ? `https://${site.customDomain}` : getAppUrl();
  return composePoster(site, request, { origin, siteUrl: posterSiteUrl(site) }, deps, now);
}

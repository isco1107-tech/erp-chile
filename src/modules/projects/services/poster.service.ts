import 'server-only';

import { getAppUrl } from '@/lib/email/mailer';
import { fetchGoogleFontSubset } from '@/lib/images/subset-font';
import { composePoster, type PosterBuild, type PosterDeps, type PosterRequest } from '@/lib/posters/compose';
import { captureException } from '@/lib/observability';
import { isAllowedBlobUrl } from '@/lib/security/blob-url';
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
 * Foto achicada y en JPEG para que el renderizador no cargue originales de
 * varios MB (un mosaico de 30 candidatas sería lentísimo). Solo URLs de
 * nuestro almacenamiento: el servidor nunca sale a buscar una dirección
 * arbitraria guardada en un campo.
 */
async function loadPhoto(url: string, maxSide: number): Promise<string | null> {
  if (!isAllowedBlobUrl(url)) return null;
  const response = await fetch(url);
  if (!response.ok) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  try {
    const { default: sharp } = await import('sharp');
    const resized = await sharp(bytes).rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch {
    // Sin sharp (o una imagen que no sabe leer): el original, si el renderizador lo soporta.
    const type = response.headers.get('content-type') ?? '';
    return /^image\/(jpeg|png)/.test(type) ? `data:${type};base64,${bytes.toString('base64')}` : null;
  }
}

const deps: PosterDeps = {
  loadFont: (family, glyphs, variant) => fetchGoogleFontSubset(family, glyphs, variant),
  loadPhoto,
  onFontError: (error, family) => captureException(error, { module: 'proyectos', extra: { reason: 'poster-font', family } }),
};

export async function buildPosterImage(companyId: string, projectId: string, request: PosterRequest, now: Date = new Date()): Promise<PosterBuild> {
  const site = await getPageantSitePreview(companyId, projectId);
  if (!site) return { ok: false, status: 404, error: 'Certamen no encontrado' };
  const origin = site.customDomain ? `https://${site.customDomain}` : getAppUrl();
  return composePoster(site, request, { origin, siteUrl: posterSiteUrl(site) }, deps, now);
}

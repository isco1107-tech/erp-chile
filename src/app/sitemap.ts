import type { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/email/mailer';
import { captureException } from '@/lib/observability';
import { listIndexablePageantSlugs } from '@/modules/projects/services/public-site.service';

/**
 * Rutas públicas y estables del sitio comercial, más los micrositios de
 * certámenes publicados que viven en la plataforma (`/certamen/[slug]`). Los
 * certámenes con dominio propio publican su sitemap en su dominio.
 *
 * Dinámico: un certamen publicado hoy debe aparecer sin esperar otro despliegue.
 * Si la base no responde, el sitemap sigue saliendo con las rutas fijas.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppUrl();
  const lastModified = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: base, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/conoce-aether`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/empresas`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${base}/aether/privacidad`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/aether/terminos`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/login`, lastModified, changeFrequency: 'yearly', priority: 0.2 },
  ];

  let slugs: string[] = [];
  try {
    slugs = await listIndexablePageantSlugs();
  } catch (error) {
    captureException(error, { module: 'certamen', extra: { reason: 'sitemap' } });
  }
  const pageants: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${base}/certamen/${encodeURIComponent(slug)}`,
    lastModified,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));
  return [...fixed, ...pageants];
}

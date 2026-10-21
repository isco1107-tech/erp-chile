import type { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/email/mailer';
import { SHOWCASE_MODULES } from '@/lib/marketing/module-showcase';

/** Rutas públicas y estables del sitio comercial. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const lastModified = new Date();
  return [
    { url: base, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/conoce-aether`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/empresas`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    ...SHOWCASE_MODULES.map((module) => ({ url: `${base}/modulos/${module.slug}`, lastModified, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${base}/aether/privacidad`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/aether/terminos`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/login`, lastModified, changeFrequency: 'yearly', priority: 0.2 },
  ];
}

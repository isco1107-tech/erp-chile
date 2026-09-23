import type { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/email/mailer';

/** Rutas públicas y estables del sitio comercial. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getAppUrl();
  const lastModified = new Date();
  return [
    { url: base, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/conoce-aether`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/aether/privacidad`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/aether/terminos`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/login`, lastModified, changeFrequency: 'yearly', priority: 0.2 },
  ];
}

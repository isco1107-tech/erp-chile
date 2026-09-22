import type { MetadataRoute } from 'next';
import { getAppUrl } from '@/lib/email/mailer';

/**
 * Solo la landing comercial y las páginas legales son indexables.
 *
 * El resto del ERP vive detrás de sesión, pero además hay rutas públicas por
 * link con token (jurado, auspiciadores, verificación de credenciales,
 * postulación, entradas y votación): un buscador que las indexara publicaría
 * el token en sus resultados. Se excluyen de forma explícita.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getAppUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard',
        '/superadmin',
        '/judging',
        '/sponsors',
        '/verify',
        '/register',
        '/tickets',
        '/votar',
        '/accept-invitation',
        '/reset-password',
        '/forgot-password',
        '/change-password',
        '/suspended',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

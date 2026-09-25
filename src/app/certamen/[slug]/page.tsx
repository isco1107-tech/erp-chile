import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { PublicStatus } from '@/components/public/PublicShell';
import { PageantSiteDocument, pageantSiteMetadata } from '@/components/public/pageant/PageantSiteDocument';
import { getPublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Micrositio público de un certamen. Server Component: los datos se resuelven
 * en el servidor (mejor SEO y vista previa al compartir el link en redes) y
 * solo la cuenta regresiva, la galería y los formularios son interactivos.
 * `cache()` evita consultar dos veces entre `generateMetadata` y la página.
 *
 * Si el certamen tiene dominio propio ya verificado, esta dirección redirige
 * (308) a la raíz de ese dominio: el sitio se publica solo ahí, no en la
 * dirección de la plataforma (`*.vercel.app`). Los enlaces viejos siguen
 * funcionando porque redirigen.
 */
const loadSite = cache((slug: string) => getPublicPageantSite(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: 'Certamen no disponible', robots: { index: false } };
  return pageantSiteMetadata(site);
}

export default async function PageantSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) {
    return <PublicStatus variant="error" title="Este certamen no está disponible" message="El link no existe o el sitio todavía no fue publicado por la organización." />;
  }
  // Tanto desde la plataforma como desde el propio dominio (`dominio/certamen/slug`), a la raíz del dominio.
  if (site.customDomain) permanentRedirect(`https://${site.customDomain}`);
  return <PageantSiteDocument site={site} />;
}

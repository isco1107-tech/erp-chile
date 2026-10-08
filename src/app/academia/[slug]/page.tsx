import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { PublicStatus } from '@/components/public/PublicShell';
import { AcademySiteDocument, academySiteMetadata } from '@/components/public/academy/AcademySiteDocument';
import { getPublicAcademySite } from '@/modules/academy/services/academy-site.service';

/**
 * Micrositio público de la academia. Server Component: los datos se resuelven
 * en el servidor (mejor SEO y vista previa al compartir el link) y solo el
 * carrusel y la animación de entrada son interactivos. `cache()` evita
 * consultar dos veces entre `generateMetadata` y la página. La dirección
 * `/academia/inscripcion/[token]` (formulario) tiene su propia ruta y el slug
 * `inscripcion` está reservado. Con dominio propio verificado, redirige (308)
 * a la raíz de ese dominio, igual que un certamen.
 */
const loadSite = cache((slug: string) => getPublicAcademySite(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: 'Academia no disponible', robots: { index: false } };
  return academySiteMetadata(site);
}

export default async function AcademySitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) {
    return <PublicStatus variant="error" title="Esta academia no está disponible" message="El link no existe o el sitio todavía no fue publicado." />;
  }
  // Con dominio propio verificado, el sitio se publica solo ahí (los enlaces viejos redirigen).
  if (site.customDomain) permanentRedirect(`https://${site.customDomain}`);
  return <AcademySiteDocument site={site} />;
}

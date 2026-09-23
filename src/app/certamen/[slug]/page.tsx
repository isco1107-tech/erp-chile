import type { Metadata } from 'next';
import { cache } from 'react';
import { PublicStatus } from '@/components/public/PublicShell';
import { PageantSiteClient } from '@/components/public/PageantSiteClient';
import { getPublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Micrositio público de un certamen. Server Component: los datos se resuelven
 * en el servidor (mejor SEO y vista previa al compartir el link en redes) y
 * solo la cuenta regresiva, la galería y el formulario son interactivos.
 * `cache()` evita consultar dos veces entre `generateMetadata` y la página.
 */
const loadSite = cache((slug: string) => getPublicPageantSite(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: 'Certamen no disponible', robots: { index: false } };
  const description = site.tagline ?? site.description?.slice(0, 160) ?? `${site.name} — organiza ${site.organizer}`;
  return {
    title: site.name,
    description,
    openGraph: { title: site.name, description, images: site.coverImageUrl ? [{ url: site.coverImageUrl }] : undefined, type: 'website' },
    twitter: { card: site.coverImageUrl ? 'summary_large_image' : 'summary', title: site.name, description },
  };
}

export default async function PageantSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) {
    return <PublicStatus variant="error" title="Este certamen no está disponible" message="El link no existe o el sitio todavía no fue publicado por la organización." />;
  }
  return <PageantSiteClient site={site} />;
}

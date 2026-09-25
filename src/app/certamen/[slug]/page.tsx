import type { Metadata } from 'next';
import { cache } from 'react';
import { PublicStatus } from '@/components/public/PublicShell';
import { PageantSite } from '@/components/public/pageant/PageantSite';
import { formatCurrency } from '@/lib/chile/tax';
import { getAppUrl } from '@/lib/email/mailer';
import { buildPageantView } from '@/lib/events/pageant-site';
import { getPublicPageantSite, type PublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Micrositio público de un certamen. Server Component: los datos se resuelven
 * en el servidor (mejor SEO y vista previa al compartir el link en redes) y
 * solo la cuenta regresiva, la galería y los formularios son interactivos.
 * `cache()` evita consultar dos veces entre `generateMetadata` y la página.
 *
 * Las fechas legibles, el recorrido y las preguntas frecuentes se derivan
 * acá (`buildPageantView`) con un único `now`: así el HTML del servidor y la
 * hidratación del navegador coinciden aunque su versión de ICU no.
 */
const loadSite = cache((slug: string) => getPublicPageantSite(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) return { title: 'Certamen no disponible', robots: { index: false } };
  const description = site.tagline ?? site.description?.slice(0, 160) ?? `${site.name} — sitio oficial del certamen`;
  // La imagen para redes la genera `opengraph-image.tsx` (con la portada si existe).
  return {
    title: { absolute: site.name },
    description,
    alternates: { canonical: `/certamen/${slug}` },
    openGraph: { title: site.name, description, type: 'website', locale: 'es_CL', siteName: site.name },
    twitter: { card: 'summary_large_image', title: site.name, description },
  };
}

/** Evento para buscadores (schema.org/Event): solo hechos publicados en la página. */
function eventJsonLd(site: PublicPageantSite, siteUrl: string): Record<string, unknown> | null {
  if (!site.galaDate) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: site.name,
    description: site.tagline ?? site.description ?? undefined,
    startDate: site.galaDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    url: siteUrl,
    image: site.coverImageUrl ? [site.coverImageUrl] : undefined,
    location: site.venueName
      ? { '@type': 'Place', name: site.venueName, address: site.venueAddress ? { '@type': 'PostalAddress', streetAddress: site.venueAddress, addressCountry: 'CL' } : undefined }
      : undefined,
    organizer: { '@type': 'Organization', name: site.organizer },
    offers:
      site.tickets && site.tickets.fromPrice != null
        ? { '@type': 'Offer', url: `${siteUrl.replace(/\/certamen\/.*$/, '')}${site.tickets.href}`, price: site.tickets.fromPrice, priceCurrency: 'CLP', availability: 'https://schema.org/InStock' }
        : undefined,
  };
}

export default async function PageantSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await loadSite(slug);
  if (!site) {
    return <PublicStatus variant="error" title="Este certamen no está disponible" message="El link no existe o el sitio todavía no fue publicado por la organización." />;
  }
  const view = buildPageantView(site, new Date(), getAppUrl(), formatCurrency);
  const jsonLd = eventJsonLd(site, view.siteUrl);
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          // JSON.stringify no escapa "<": se neutraliza para que un texto del certamen no pueda cerrar el <script>.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      <PageantSite site={site} view={view} />
    </>
  );
}

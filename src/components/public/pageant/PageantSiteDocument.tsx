import type { Metadata } from 'next';
import { PageantSite } from '@/components/public/pageant/PageantSite';
import { formatCurrency } from '@/lib/chile/tax';
import { getAppUrl } from '@/lib/email/mailer';
import { buildPageantView } from '@/lib/events/pageant-site';
import type { PublicPageantSite } from '@/modules/projects/services/public-site.service';

/**
 * Página completa del micrositio de un certamen, compartida por sus dos
 * direcciones: `/certamen/[slug]` y la raíz de su dominio propio
 * (`/sitio/[host]`, a la que reescribe el proxy). Las fechas legibles, el
 * recorrido y las preguntas frecuentes se derivan acá (`buildPageantView`)
 * con un único `now`: así el HTML del servidor y la hidratación coinciden.
 */

/** Metadatos para buscadores y redes; la URL canónica es el dominio propio si está verificado. */
export function pageantSiteMetadata(site: PublicPageantSite): Metadata {
  const description = site.tagline ?? site.description?.slice(0, 160) ?? `${site.name} — sitio oficial del certamen`;
  const canonical = site.customDomain ? `https://${site.customDomain}` : `/certamen/${site.slug}`;
  // La imagen para redes la genera `/certamen/[slug]/opengraph-image` (con la portada si existe).
  const ogImage = `${site.customDomain ? `https://${site.customDomain}` : ''}/certamen/${site.slug}/opengraph-image`;
  return {
    title: { absolute: site.name },
    description,
    alternates: { canonical },
    openGraph: { title: site.name, description, type: 'website', locale: 'es_CL', siteName: site.name, url: canonical, images: [ogImage] },
    twitter: { card: 'summary_large_image', title: site.name, description, images: [ogImage] },
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

export function PageantSiteDocument({ site }: { site: PublicPageantSite }) {
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

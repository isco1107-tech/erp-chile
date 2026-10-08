import type { Metadata } from 'next';
import { AcademySite } from './AcademySite';
import type { PublicAcademySite } from '@/modules/academy/services/academy-site.service';

/** Metadatos para buscadores y redes: solo hechos publicados en la página. */
export function academySiteMetadata(site: PublicAcademySite): Metadata {
  const description = site.tagline.trim() || site.intro.trim().slice(0, 160) || `${site.name} — academia`;
  const canonical = `/academia/${site.slug}`;
  const images = site.heroImageUrl ? [site.heroImageUrl] : undefined;
  return {
    title: { absolute: site.name },
    description,
    alternates: { canonical },
    openGraph: { title: site.name, description, type: 'website', locale: 'es_CL', siteName: site.name, url: canonical, images },
    twitter: { card: 'summary_large_image', title: site.name, description, images },
  };
}

/** Datos estructurados (schema.org/EducationalOrganization): solo lo que la página ya muestra. */
function organizationJsonLd(site: PublicAcademySite): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: site.name,
    description: site.tagline.trim() || site.intro.trim() || undefined,
    image: site.heroImageUrl ?? undefined,
    email: site.contact.email ?? undefined,
    telephone: site.contact.whatsapp?.label,
    address: site.contact.address ? { '@type': 'PostalAddress', streetAddress: site.contact.address, addressCountry: 'CL' } : undefined,
    sameAs: site.contact.instagrams.map((i) => i.href),
  };
}

export function AcademySiteDocument({ site }: { site: PublicAcademySite }) {
  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify no escapa "<": se neutraliza para que un texto de la academia no pueda cerrar el <script>.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(site)).replace(/</g, '\\u003c') }}
      />
      <AcademySite site={site} />
    </>
  );
}

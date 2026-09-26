import { faqs } from '../content';
import { faqSection } from './content';

/**
 * Datos estructurados (JSON-LD) de `/empresas`. `@id` propios (distintos de
 * los que usa `StructuredData.tsx` en `/`) para no duplicar el `@id` de la
 * organización entre las dos landings del mismo dominio. El `FAQPage` solo
 * lista las preguntas que de verdad se muestran en la página (ver `content.ts`).
 */
export default function StructuredDataEmpresas({ base, salesEmail }: { base: string; salesEmail: string }) {
  const pageUrl = `${base}/empresas`;
  const organization = `${pageUrl}/#organizacion`;
  const selectedFaqs = faqSection.questions
    .map((question) => faqs.find(([entryQuestion]) => entryQuestion === question))
    .filter((entry): entry is [string, string] => Boolean(entry));

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organization,
        name: 'Aether ERP Solutions',
        url: pageUrl,
        email: salesEmail,
        logo: `${base}/branding/aether-logo-full.png`,
        areaServed: { '@type': 'Country', name: 'Chile' },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${pageUrl}/#software`,
        name: 'Aether ERP',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'ERP',
        operatingSystem: 'Navegador web, Windows 10/11, macOS, Linux',
        inLanguage: 'es-CL',
        url: pageUrl,
        image: `${base}/branding/aether-logo-full.png`,
        description: 'ERP chileno de gestión empresarial: ventas, inventario con costo promedio ponderado, compras, tesorería, contabilidad y documentos tributarios electrónicos, con una línea propia para producir certámenes y eventos.',
        publisher: { '@id': organization },
        featureList: [
          'Documentos tributarios electrónicos con folios CAF y timbre electrónico',
          'Cálculo de IVA 19% repartido por línea',
          'F29 del período con débito, crédito, remanente y PPM',
          'Inventario multibodega con kardex y costo promedio ponderado',
          'Tesorería, cuentas por cobrar y pagar, y flujo de caja',
          'Contabilidad, plan de cuentas y cierre mensual',
          'Multiempresa con roles y permisos a medida',
          'Producción de certámenes y eventos: candidatas, jurado, auspicios, ticketing y votación',
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}/#preguntas`,
        inLanguage: 'es-CL',
        mainEntity: selectedFaqs.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}

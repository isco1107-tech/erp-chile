import { faqs } from './content';

/**
 * Datos estructurados (JSON-LD) de la landing comercial.
 *
 * Solo declara hechos que están en la página: sin valoraciones, reseñas ni
 * precios inventados, que además de deshonestos son motivo de penalización.
 * Las preguntas salen del mismo arreglo que renderiza el FAQ visible.
 */
export default function StructuredData({ base, salesEmail }: { base: string; salesEmail: string }) {
  const organization = `${base}/#organizacion`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organization,
        name: 'Aether ERP Solutions',
        url: base,
        email: salesEmail,
        logo: `${base}/branding/aether-logo-full.png`,
        areaServed: { '@type': 'Country', name: 'Chile' },
      },
      {
        '@type': 'WebSite',
        '@id': `${base}/#sitio`,
        url: base,
        name: 'Aether ERP',
        inLanguage: 'es-CL',
        publisher: { '@id': organization },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Aether ERP',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'ERP',
        operatingSystem: 'Navegador web, Windows 10/11, macOS, Linux',
        inLanguage: 'es-CL',
        url: base,
        image: `${base}/branding/aether-logo-full.png`,
        description: 'ERP chileno de gestión empresarial, con ventas, inventario con costo promedio ponderado, compras, tesorería, contabilidad, documentos tributarios electrónicos y módulos por industria.',
        publisher: { '@id': organization },
        featureList: [
          'Documentos tributarios electrónicos con folios CAF y timbre electrónico',
          'Cálculo de IVA 19% y productos exentos',
          'Formulario F29 del período con PPM y remanente de crédito fiscal',
          'Inventario multibodega con kardex y costo promedio ponderado',
          'Tesorería, cuentas por cobrar y pagar, y flujo de caja proyectado',
          'Contabilidad, plan de cuentas y cierre mensual',
          'Punto de venta',
          'Producción de certámenes y eventos: proyectos, auspicios, ticketing y votación',
          'Multiempresa con roles y permisos a medida',
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${base}/#preguntas`,
        inLanguage: 'es-CL',
        mainEntity: faqs.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />;
}

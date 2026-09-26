import type { Metadata } from 'next';
import CorporateLanding from '@/components/marketing/corporate/CorporateLanding';
import StructuredDataEmpresas from '@/components/marketing/corporate/StructuredDataEmpresas';
import { getAppUrl } from '@/lib/email/mailer';

const SALES_EMAIL = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: 'Aether ERP para empresas | Gestión, finanzas y cumplimiento SII',
  description: 'ERP chileno para empresas: ventas, inventario, compras, tesorería y contabilidad en un solo sistema, con folios CAF y timbre electrónico. Solicita una demo.',
  keywords: ['ERP para empresas', 'ERP chileno', 'software de gestión empresarial', 'facturación electrónica', 'DTE', 'SII', 'F29', 'contabilidad', 'inventario', 'multiempresa'],
  alternates: { canonical: '/empresas' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Aether ERP para empresas | Gestión, finanzas y cumplimiento SII',
    description: 'Ventas, inventario, compras, tesorería y contabilidad en un solo ERP chileno, con cumplimiento SII. Solicita una demo para tu empresa.',
    type: 'website',
    locale: 'es_CL',
    siteName: 'Aether ERP',
    url: '/empresas',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aether ERP para empresas',
    description: 'ERP chileno con cumplimiento SII: ventas, inventario, finanzas y contabilidad en un solo sistema.',
  },
};

/**
 * Landing corporativa para compradores B2B (gerencias, TI, finanzas): blanca,
 * sobria y estática, distinta de la cinematográfica de `/`. Ver
 * `src/components/marketing/corporate/`.
 */
export default function EmpresasPage() {
  return (
    <>
      <StructuredDataEmpresas base={getAppUrl()} salesEmail={SALES_EMAIL} />
      <CorporateLanding
        salesEmail={SALES_EMAIL}
        salesWhatsapp={process.env.AETHER_SALES_WHATSAPP}
        legalName={process.env.AETHER_LEGAL_NAME}
        legalRut={process.env.AETHER_LEGAL_RUT}
      />
    </>
  );
}

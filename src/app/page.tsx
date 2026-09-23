import type { Metadata } from 'next';
import Landing from '@/components/marketing/Landing';
import releases from '../../public/downloads/releases.json';
import InstalledAppEntry from '@/components/marketing/InstalledAppEntry';
import StructuredData from '@/components/marketing/StructuredData';
import { getAppUrl } from '@/lib/email/mailer';

const SALES_EMAIL = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: 'Aether ERP | Tu empresa, conectada',
  description: 'Ventas, inventario, finanzas y eventos en un solo lugar. Conoce Aether ERP, la plataforma de gestión para empresas chilenas. Disponible en web y escritorio.',
  keywords: ['ERP chileno', 'software de gestión', 'facturación electrónica', 'DTE', 'SII', 'F29', 'inventario', 'punto de venta', 'producción de eventos'],
  // Las dos rutas (`/` y `/conoce-aether`) sirven la misma landing: la canónica
  // evita que compitan entre ellas por el mismo contenido.
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  // La imagen la genera `src/app/opengraph-image.tsx` (1200×630 con titular).
  openGraph: {
    title: 'Aether ERP | Tu empresa, conectada',
    description: 'Del primer presupuesto al último pago. Una plataforma para toda tu operación.',
    type: 'website', locale: 'es_CL', siteName: 'Aether ERP',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aether ERP | Tu empresa, conectada',
    description: 'Del primer presupuesto al último pago. Una plataforma para toda tu operación.',
  },
};

export default function HomePage() {
  return <>
    <StructuredData base={getAppUrl()} salesEmail={SALES_EMAIL} />
    <InstalledAppEntry />
    <Landing releases={releases} salesEmail={SALES_EMAIL} salesWhatsapp={process.env.AETHER_SALES_WHATSAPP} legalName={process.env.AETHER_LEGAL_NAME} legalRut={process.env.AETHER_LEGAL_RUT} />
  </>;
}

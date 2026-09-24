import type { Metadata } from 'next';
import CinematicLanding from '@/components/marketing/cinematic/CinematicLanding';
import { displayFont } from '@/components/marketing/cinematic/displayFont';
import releases from '../../public/downloads/releases.json';
import InstalledAppEntry from '@/components/marketing/InstalledAppEntry';
import StructuredData from '@/components/marketing/StructuredData';
import { getAppUrl } from '@/lib/email/mailer';

const SALES_EMAIL = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: 'Aether ERP | Tu empresa, conectada',
  description: 'ERP chileno para gestionar tu empresa en un solo sistema: ventas, inventario, compras, finanzas y contabilidad, con cumplimiento SII.',
  keywords: ['ERP chileno', 'software de gestión', 'facturación electrónica', 'DTE', 'SII', 'F29', 'inventario', 'punto de venta', 'contabilidad', 'gestión empresarial'],
  // Las dos rutas (`/` y `/conoce-aether`) sirven la misma landing: la canónica
  // evita que compitan entre ellas por el mismo contenido.
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  // La imagen la genera `src/app/opengraph-image.tsx` (1200×630 con titular).
  openGraph: {
    title: 'Aether ERP | Tu empresa, conectada',
    description: 'ERP chileno para gestionar tu empresa en un solo sistema, con cumplimiento SII.',
    type: 'website', locale: 'es_CL', siteName: 'Aether ERP',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aether ERP | Tu empresa, conectada',
    description: 'ERP chileno para gestionar tu empresa en un solo sistema, con cumplimiento SII.',
  },
};

export default function HomePage() {
  return <>
    <StructuredData base={getAppUrl()} salesEmail={SALES_EMAIL} />
    <InstalledAppEntry />
    <CinematicLanding
      className={displayFont.variable}
      releases={releases}
      salesEmail={SALES_EMAIL}
      salesWhatsapp={process.env.AETHER_SALES_WHATSAPP}
      legalName={process.env.AETHER_LEGAL_NAME}
      legalRut={process.env.AETHER_LEGAL_RUT}
    />
  </>;
}

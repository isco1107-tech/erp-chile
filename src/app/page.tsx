import type { Metadata } from 'next';
import HomeLanding from '@/components/marketing/home/HomeLanding';
import releases from '../../public/downloads/releases.json';
import InstalledAppEntry from '@/components/marketing/InstalledAppEntry';
import StructuredData from '@/components/marketing/StructuredData';
import { getAppUrl } from '@/lib/email/mailer';

const SALES_EMAIL = process.env.AETHER_SALES_EMAIL ?? 'aethererp1@gmail.com';

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: 'Aether ERP | Tu empresa, conectada',
  description: 'Conecta ventas, inventario, finanzas, academias y eventos en Aether ERP. Crea tu sitio web con IA y configura los módulos que necesita tu operación en Chile.',
  keywords: ['ERP chileno', 'software de gestión', 'facturación electrónica', 'DTE', 'SII', 'F29', 'inventario', 'punto de venta', 'contabilidad', 'gestión empresarial'],
  // Las dos rutas (`/` y `/conoce-aether`) sirven la misma landing: la canónica
  // evita que compitan entre ellas por el mismo contenido.
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  // La imagen la genera `src/app/opengraph-image.tsx` (1200×630 con titular).
  openGraph: {
    title: 'Aether ERP | Tu empresa, conectada',
    description: 'Ventas, finanzas, academias, eventos y sitios web con IA. Conecta tu operación en una plataforma creada para Chile.',
    type: 'website', locale: 'es_CL', siteName: 'Aether ERP',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aether ERP | Tu empresa, conectada',
    description: 'Ventas, finanzas, academias, eventos y sitios web con IA. Conecta tu operación en una plataforma creada para Chile.',
  },
};

export default function HomePage() {
  return <>
    <StructuredData base={getAppUrl()} salesEmail={SALES_EMAIL} />
    <InstalledAppEntry />
    <HomeLanding
      releases={releases}
      salesEmail={SALES_EMAIL}
      legalName={process.env.AETHER_LEGAL_NAME}
      legalRut={process.env.AETHER_LEGAL_RUT}
    />
  </>;
}

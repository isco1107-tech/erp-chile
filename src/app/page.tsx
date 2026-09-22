import type { Metadata } from 'next';
import Landing from '@/components/marketing/Landing';
import releases from '../../public/downloads/releases.json';
import InstalledAppEntry from '@/components/marketing/InstalledAppEntry';

export const metadata: Metadata = {
  title: 'Aether ERP | Tu empresa, conectada',
  description: 'Ventas, inventario, finanzas y eventos en un solo lugar. Conoce Aether ERP, la plataforma de gestión para empresas chilenas. Disponible en web y escritorio.',
  openGraph: {
    title: 'Aether ERP | Tu empresa, conectada',
    description: 'Del primer presupuesto al último pago. Una plataforma para toda tu operación.',
    type: 'website', locale: 'es_CL',
    images: [{ url: '/branding/aether-logo-full.png', width: 1280, height: 698, alt: 'Aether ERP Solutions' }],
  },
};

export default function HomePage() {
  return <><InstalledAppEntry /><Landing releases={releases} salesEmail={process.env.AETHER_SALES_EMAIL} salesWhatsapp={process.env.AETHER_SALES_WHATSAPP} /></>;
}

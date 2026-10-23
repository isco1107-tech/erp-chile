import type { Metadata, Viewport } from 'next';
import { WarehouseInstallProvider } from '@/components/bodega/InstallApp';

/**
 * App del bodeguero (`/bodega`): instalable en el celular, a pantalla completa.
 *
 * Este layout NO imprime datos de la persona ni de la empresa. Es a propósito:
 * el service worker guarda una copia de esta página para poder abrirla sin
 * señal, y esa copia no debe contener nada que otra persona del mismo teléfono
 * no pueda ver. El nombre, las bodegas y todo lo demás llegan por la API, con la
 * sesión, y se guardan en la base local de cada persona.
 */

export const metadata: Metadata = {
  title: 'Aether Bodega',
  description: 'Ingresa, descuenta y traslada productos de tu bodega desde el celular.',
  manifest: '/bodega/manifest.webmanifest',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Bodega', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon.png', apple: '/branding/app-icon-512.png' },
};

export const viewport: Viewport = {
  themeColor: '#12161f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function BodegaLayout({ children }: { children: React.ReactNode }) {
  return <WarehouseInstallProvider>{children}</WarehouseInstallProvider>;
}

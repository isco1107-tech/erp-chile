import type { Metadata, Viewport } from 'next';
import { ApplicationInstallProvider } from '@/components/apps/InstallApplication';
import { appMetadata, appViewport } from '@/lib/apps/manifest';

/**
 * App del bodeguero (`/bodega`): instalable en el celular, a pantalla completa.
 *
 * Este layout NO imprime datos de la persona ni de la empresa. Es a propósito:
 * el service worker guarda una copia de esta página para poder abrirla sin
 * señal, y esa copia no debe contener nada que otra persona del mismo teléfono
 * no pueda ver. El nombre, las bodegas y todo lo demás llegan por la API, con la
 * sesión, y se guardan en la base local de cada persona.
 */

export const metadata: Metadata = appMetadata('bodega');

export const viewport: Viewport = appViewport('bodega');

export default function BodegaLayout({ children }: { children: React.ReactNode }) {
  return <ApplicationInstallProvider app="bodega">{children}</ApplicationInstallProvider>;
}

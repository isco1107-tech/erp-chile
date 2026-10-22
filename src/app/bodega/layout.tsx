import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { AuthError, IpNotAllowedError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';

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

export default async function BodegaLayout({ children }: { children: React.ReactNode }) {
  let allowed = true;
  try {
    const context = await getAuthContext();
    if (context.mustChangePassword) redirect('/change-password');
    allowed = can(context, 'products:read');
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof IpNotAllowedError) redirect('/login?reason=ip');
    if (error instanceof AuthError) redirect('/login?callbackUrl=%2Fbodega');
    throw error;
  }

  // `theme-saas-light` + `bodega-app`: mismo tema claro del panel, y la firma flotante «Hecho con Aether» se oculta (ver globals.css).
  return (
    <div className="theme-saas-light bodega-app fixed inset-0 overflow-hidden bg-background text-foreground">
      {allowed ? (
        children
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <Lock className="size-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Sin acceso a la bodega</h1>
          <p className="max-w-xs text-base text-muted-foreground">Tu empresa no tiene el módulo de Inventario o tu rol no permite usarlo. Pide a un administrador que lo habilite.</p>
        </div>
      )}
    </div>
  );
}

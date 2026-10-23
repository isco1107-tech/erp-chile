import { redirect } from 'next/navigation';
import { Lock } from 'lucide-react';
import { AuthError, IpNotAllowedError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';

export default async function BodegaLayout({ children }: { children: React.ReactNode }) {
  let allowed = true;
  try {
    const context = await getAuthContext();
    if (context.mustChangePassword) redirect('/change-password');
    allowed = can(context, 'products:read');
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof IpNotAllowedError) redirect('/login?reason=ip');
    if (error instanceof AuthError) redirect('/bodega/ingresar');
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

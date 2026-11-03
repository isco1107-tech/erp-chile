import { redirect } from 'next/navigation';
import { AppAccessNotice } from '@/components/apps/AppAccessNotice';
import { AuthError, IpNotAllowedError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';

export default async function BodegaLayout({ children }: { children: React.ReactNode }) {
  let allowed = true;
  let missing: 'module' | 'permission' = 'permission';
  let isOwner = false;
  try {
    const context = await getAuthContext();
    if (context.mustChangePassword) redirect('/change-password');
    allowed = can(context, 'products:read');
    missing = context.features.hasInventory ? 'permission' : 'module';
    isOwner = context.role === 'OWNER';
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    // Dentro de la app: `/login` saca al bodeguero de Bodega y lo deja en el ingreso del ERP.
    if (error instanceof IpNotAllowedError) redirect('/bodega/ingresar?reason=ip');
    if (error instanceof AuthError) redirect('/bodega/ingresar');
    throw error;
  }

  // `theme-saas-light` + `bodega-app`: mismo tema claro del panel, y la firma flotante «Hecho con Aether» se oculta (ver globals.css).
  return (
    <div className="theme-saas-light bodega-app fixed inset-0 overflow-hidden bg-background text-foreground">
      {allowed ? (
        children
      ) : (
        <div className="flex h-full items-center justify-center overflow-y-auto p-4">
          <AppAccessNotice missing={missing} moduleName="Inventario" action="usar la bodega" isOwner={isOwner} />
        </div>
      )}
    </div>
  );
}

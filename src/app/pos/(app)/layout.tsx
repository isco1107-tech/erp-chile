import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AuthError, IpNotAllowedError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import LogoutButton from '@/components/LogoutButton';

export default async function PosTerminalLayout({ children }: { children: ReactNode }) {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof IpNotAllowedError) redirect('/pos/ingresar?reason=ip');
    if (error instanceof AuthError) redirect('/pos/ingresar');
    throw error;
  }
  if (context.mustChangePassword) redirect('/change-password');
  const allowed = can(context, 'pos:operate');
  return (
    <ConfirmProvider>
      <a href="#contenido-principal" className="skip-link">Ir al contenido</a>
      <header className="border-b border-border bg-card pt-[env(safe-area-inset-top)] print:hidden">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-3 px-3 py-2 sm:px-6">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="text-sm font-semibold">Aether POS · {context.companyName}</p>
            <p className="text-sm text-muted-foreground">{context.name}</p>
          </div>
          <LogoutButton destination="/pos/ingresar" className="shrink-0" />
        </div>
      </header>
      <main id="contenido-principal" tabIndex={-1} className="mx-auto max-w-[1600px] p-3 outline-none sm:p-6 print:p-0">
        {allowed ? children : <section className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center"><h1 className="text-xl font-semibold">Sin acceso al Punto de Venta</h1><p className="mt-3 text-muted-foreground">Pide al administrador que habilite el módulo y el permiso de operación para tu usuario.</p></section>}
      </main>
    </ConfirmProvider>
  );
}

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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 print:hidden sm:px-6">
        <div className="min-w-0 flex-1 basis-64 [overflow-wrap:anywhere]"><p className="font-semibold">Aether POS · {context.companyName}</p><p className="text-sm text-muted-foreground">Cajero: {context.name} · {context.email}</p></div>
        <LogoutButton destination="/pos/ingresar" />
      </header>
      <main className="mx-auto max-w-[1600px] p-3 sm:p-6 print:p-0">
        {allowed ? children : <section className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center"><h1 className="text-xl font-semibold">Sin acceso al Punto de Venta</h1><p className="mt-3 text-muted-foreground">Pide al administrador que habilite el módulo y el permiso de operación para tu usuario.</p></section>}
      </main>
    </ConfirmProvider>
  );
}

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AuthError, IpNotAllowedError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { ConfirmProvider } from '@/components/ui/confirm-provider';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import SessionExpiryNotice from '@/components/shared/SessionExpiryNotice';
import { AppAccessNotice } from '@/components/apps/AppAccessNotice';
import { currentSessionExpiresAt } from '@/lib/auth/session-expires-at';
import { listAccessibleCompanies, selectableCount } from '@/lib/auth/accessible-companies';

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
  // Un cajero que atiende en dos empresas no tiene barra lateral: el cambio va en la cabecera.
  const multiCompany = selectableCount(await listAccessibleCompanies(context.id)) > 1;
  const sessionExpiresAt = await currentSessionExpiresAt();
  return (
    <ConfirmProvider>
      {/* Un turno suele durar más que la sesión de 8 horas: que el cierre no llegue a media venta. */}
      <SessionExpiryNotice
        expiresAt={sessionExpiresAt}
        loginPath="/pos/ingresar"
        warningHint="Termina la venta en curso (o déjala en espera, que queda guardada en este equipo) y vuelve a ingresar con tu cuenta. El turno de caja sigue abierto."
      />
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 print:hidden sm:px-6">
        <div className="min-w-0 flex-1 basis-64 [overflow-wrap:anywhere]"><p className="font-semibold">Aether POS · {context.companyName}</p><p className="text-sm text-muted-foreground">Cajero: {context.name} · {context.email}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {multiCompany && <Link href="/seleccionar-empresa" className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Cambiar de empresa</Link>}
          <LogoutButton destination="/pos/ingresar" />
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] p-3 sm:p-6 print:p-0">
        {allowed ? children : <AppAccessNotice missing={context.features.hasPos ? 'permission' : 'module'} moduleName="Punto de Venta" action="vender en caja" isOwner={context.role === 'OWNER'} />}
      </main>
    </ConfirmProvider>
  );
}

import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, LayoutDashboard, ArrowLeft, ShieldCheck, ScrollText } from 'lucide-react';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import LogoutButton from '@/components/LogoutButton';
import { ConfirmProvider } from '@/components/ui/confirm-provider';

export const metadata = { title: { default: 'Panel de Plataforma', template: '%s · Plataforma Aether' } };

/**
 * Portal del dueño del SaaS. Layout separado del dashboard de clientes: aquí no
 * hay `companyId` de contexto y las consultas cruzan deliberadamente todos los
 * tenants, así que mezclar ambos árboles invitaría a filtrar datos entre ellos.
 * Visualmente usa el mismo tema claro y la misma barra lateral oscura del
 * panel de empresas, para que no parezca otro producto.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  let email: string;
  try {
    const session = await requireSuperAdmin();
    email = session.email;
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) redirect('/dashboard');
    redirect('/login');
  }

  const linkClass =
    'flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] text-sidebar-foreground transition-colors hover:bg-white/[0.04] hover:text-white';

  return (
    <div className="theme-saas-light flex min-h-screen bg-background text-foreground">
      <ConfirmProvider>
        <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-4 md:flex">
          <div className="mb-6 flex items-center gap-2.5 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/logo-on-dark.png" alt="" className="size-9 object-contain" />
            <div>
              <p className="text-sm font-semibold text-white">Aether ERP</p>
              <p className="text-xs text-sidebar-foreground">Panel de plataforma</p>
            </div>
          </div>

          <nav aria-label="Plataforma" className="space-y-0.5">
            <Link href="/superadmin" className={linkClass}>
              <LayoutDashboard className="size-4" aria-hidden="true" /> <span>Resumen</span>
            </Link>
            <Link href="/superadmin/companies" className={linkClass}>
              <Building2 className="size-4" aria-hidden="true" /> <span>Empresas</span>
            </Link>
            <Link href="/superadmin/platform-audit-log" className={linkClass}>
              <ScrollText className="size-4" aria-hidden="true" /> <span>Bitácora de Plataforma</span>
            </Link>
          </nav>

          <div className="mt-auto space-y-1 border-t border-white/[0.06] pt-4">
            <Link href="/dashboard" className={linkClass}>
              <ArrowLeft className="size-4" aria-hidden="true" /> <span>Volver a mi empresa</span>
            </Link>
            <div className="flex items-center justify-between gap-2 px-3 pt-2">
              <p className="truncate text-xs text-sidebar-foreground">{email}</p>
              <LogoutButton variant="icon" />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b border-border bg-card/85 px-6 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              <h1 className="text-base font-semibold">Administración de Plataforma</h1>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Superadmin</span>
            </div>
            <LogoutButton className="md:hidden" />
          </header>
          <main className="p-6 lg:p-8">{children}</main>
        </div>
      </ConfirmProvider>
    </div>
  );
}

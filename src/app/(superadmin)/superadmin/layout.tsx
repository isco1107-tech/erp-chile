import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, LayoutDashboard, ArrowLeft, ShieldCheck, ScrollText } from 'lucide-react';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import LogoutButton from '@/components/LogoutButton';

export const metadata = { title: 'Panel de Plataforma' };

/**
 * Portal del dueño del SaaS. Layout separado del dashboard de clientes: aquí no
 * hay `companyId` de contexto y las consultas cruzan deliberadamente todos los
 * tenants, así que mezclar ambos árboles invitaría a filtrar datos entre ellos.
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

  const linkClass = 'flex items-center gap-2 rounded px-3 py-2 hover:bg-white/10';

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 flex-col bg-slate-900 p-4 text-slate-100 md:flex">
        <div className="mb-6 flex items-center gap-2">
          <ShieldCheck className="size-5 text-violet-400" />
          <div>
            <h3 className="text-lg font-bold leading-tight">Plataforma</h3>
            <p className="text-xs text-slate-400">Panel SaaS</p>
          </div>
        </div>

        <nav className="space-y-1 text-sm">
          <Link href="/superadmin" className={linkClass}>
            <LayoutDashboard className="size-4" /> <span>Resumen</span>
          </Link>
          <Link href="/superadmin/companies" className={linkClass}>
            <Building2 className="size-4" /> <span>Empresas</span>
          </Link>
          <Link href="/superadmin/platform-audit-log" className={linkClass}>
            <ScrollText className="size-4" /> <span>Bitácora de Plataforma</span>
          </Link>
        </nav>

        <div className="mt-auto space-y-1 border-t border-white/10 pt-4 text-sm">
          <Link href="/dashboard" className={linkClass}>
            <ArrowLeft className="size-4" /> <span>Volver a mi empresa</span>
          </Link>
          <p className="px-3 pt-2 text-xs text-slate-400">{email}</p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-muted/30 px-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Administración de Plataforma</h2>
            <span className="rounded-full bg-violet-600/10 px-2 py-0.5 text-xs font-medium text-violet-600">
              Superadmin
            </span>
          </div>
          <LogoutButton />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

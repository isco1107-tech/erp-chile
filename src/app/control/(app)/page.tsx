import Link from 'next/link';
import { LayoutGrid } from 'lucide-react';
import { redirect } from 'next/navigation';
import {
  AuthError,
  TenantInactiveError,
  getAuthContext,
} from '@/lib/auth/guards';
import ControlDashboard from '@/components/apps/ControlDashboard';
import LogoutButton from '@/components/LogoutButton';
export default async function ControlPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/control/ingresar');
    throw error;
  }
  if (context.mustChangePassword) redirect('/change-password');
  return (
    <>
      <a href="#contenido-principal" className="skip-link">Ir al contenido</a>
      <header className="border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-3 sm:px-6">
          <Link href="/apps" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <LayoutGrid className="size-4" aria-hidden="true" /> Aplicaciones
          </Link>
          <LogoutButton destination="/control/ingresar" />
        </div>
      </header>
      <main id="contenido-principal" tabIndex={-1} className="mx-auto max-w-7xl px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none sm:p-6">
        {context.role === 'OWNER' ? (
          <ControlDashboard />
        ) : (
          <section className="rounded-3xl border bg-card p-8 text-center">
            <h1 className="text-2xl font-semibold">Acceso del dueño</h1>
            <p className="mt-3 text-muted-foreground">
              Aether Control muestra información de dirección y necesita la
              cuenta del dueño de esta empresa.
            </p>
          </section>
        )}
      </main>
    </>
  );
}

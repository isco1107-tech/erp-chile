import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AuthError,
  IpNotAllowedError,
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
    // Antes del `AuthError` genérico: sin el motivo, el dueño veía el login sin explicación y volvía a caer acá.
    if (error instanceof IpNotAllowedError) redirect('/control/ingresar?reason=ip');
    if (error instanceof AuthError) redirect('/control/ingresar');
    throw error;
  }
  if (context.mustChangePassword) redirect('/change-password');
  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <Link href="/apps" className="font-semibold">
          Aether · Aplicaciones
        </Link>
        <LogoutButton destination="/control/ingresar" />
      </header>
      <main className="mx-auto max-w-7xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6">
        {context.role === 'OWNER' ? (
          <ControlDashboard />
        ) : (
          <section className="rounded-3xl border bg-card p-8 text-center">
            <h1 className="text-2xl font-semibold">Acceso del dueño</h1>
            <p className="mt-3 text-muted-foreground">
              Aether Control muestra información de dirección y necesita la
              cuenta del dueño de esta empresa. Con tu cuenta puedes seguir
              trabajando en el ERP.
            </p>
            <Link
              href="/dashboard"
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
            >
              Ir al ERP
            </Link>
          </section>
        )}
      </main>
    </>
  );
}

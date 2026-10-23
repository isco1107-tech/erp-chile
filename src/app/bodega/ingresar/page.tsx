import InstallApp from '@/components/bodega/InstallApp';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginPage';
import { AuthError, getAuthContext, TenantInactiveError } from '@/lib/auth/guards';

export default async function WarehouseLoginPage() {
  let destination: string | undefined;
  try {
    const context = await getAuthContext();
    destination = context.mustChangePassword ? '/change-password' : '/bodega';
  } catch (error) {
    if (error instanceof TenantInactiveError) destination = '/suspended';
    else if (!(error instanceof AuthError)) throw error;
  }
  if (destination) redirect(destination);
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif' }} className="theme-saas-light bodega-app flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-wide">AETHER · BODEGA MÓVIL</p>
        <Suspense fallback={<p role="status">Preparando el ingreso…</p>}><LoginForm warehouse /></Suspense>
        <div className="mt-4"><InstallApp /></div>
        <p className="mt-6 text-center text-sm text-muted-foreground">Ingresos, salidas y traslados conectados a tu ERP.</p>
      </div>
    </main>
  );
}

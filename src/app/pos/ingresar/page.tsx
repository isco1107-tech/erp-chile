import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginPage';
import { PosDesktopDownload } from '@/components/pos/PosDesktopDownload';
import InstallApplication from '@/components/apps/InstallApplication';
import { AuthError, getAuthContext, TenantInactiveError } from '@/lib/auth/guards';

export default async function PosLoginPage() {
  let destination: string | undefined;
  try {
    const context = await getAuthContext();
    destination = context.mustChangePassword ? '/change-password' : '/pos';
  } catch (error) {
    if (error instanceof TenantInactiveError) destination = '/suspended';
    else if (!(error instanceof AuthError)) throw error;
  }
  if (destination) redirect(destination);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-wide">AETHER · PUNTO DE VENTA</p>
        <Suspense fallback={<p role="status">Preparando el ingreso…</p>}><LoginForm pos /></Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">Caja, ventas e inventario conectados al ERP. Cada cajero usa su propia cuenta.</p>
        <div className="mt-4"><InstallApplication /></div>
        <div className="mt-4 flex justify-center"><PosDesktopDownload /></div>
      </div>
    </main>
  );
}

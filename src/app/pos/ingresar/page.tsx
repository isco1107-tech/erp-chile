import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
        <Link href="/apps" className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" aria-hidden="true" /> Centro de aplicaciones
        </Link>
        <Suspense fallback={<p role="status">Preparando el ingreso…</p>}><LoginForm pos /></Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">Caja, ventas e inventario conectados al ERP. Cada cajero usa su propia cuenta.</p>
        <div className="mt-4"><InstallApplication /></div>
        <div className="mt-4 flex justify-center"><PosDesktopDownload className="min-h-11" /></div>
      </div>
    </main>
  );
}

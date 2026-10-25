import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginPage';
import {
  AuthError,
  TenantInactiveError,
  getAuthContext,
} from '@/lib/auth/guards';
import InstallApplication from '@/components/apps/InstallApplication';
export default async function Page() {
  let destination: string | undefined;
  try {
    const context = await getAuthContext();
    destination = context.mustChangePassword ? '/change-password' : '/control';
  } catch (error) {
    if (error instanceof TenantInactiveError) destination = '/suspended';
    else if (!(error instanceof AuthError)) throw error;
  }
  if (destination) redirect(destination);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-4 py-8">
      <p className="text-center text-sm font-semibold tracking-widest">
        AETHER CONTROL · TU EMPRESA
      </p>
      <Suspense fallback={<p>Preparando el ingreso…</p>}>
        <LoginForm control />
      </Suspense>
      <InstallApplication />
      <a href="/apps" className="text-center text-sm underline">
        Todas las aplicaciones
      </a>
    </main>
  );
}

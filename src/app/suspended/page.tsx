import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { verifySessionToken } from '@/lib/auth/session';
import LogoutButton from '@/components/LogoutButton';

export const metadata = { title: 'Cuenta suspendida' };

const STATUS_COPY: Record<string, { title: string; message: string }> = {
  SUSPENDED: {
    title: 'Cuenta suspendida',
    message:
      'El acceso de tu empresa está temporalmente suspendido. Tus datos siguen intactos y se restablecen apenas se reactive la cuenta.',
  },
  CANCELLED: {
    title: 'Cuenta cancelada',
    message: 'La suscripción de tu empresa fue cancelada. Contacta a soporte para reactivarla o exportar tu información.',
  },
};

/**
 * Pantalla de salida para tenants no operativos. No usa el layout del dashboard
 * a propósito: ese layout llama `getAuthContext()`, que es justamente lo que
 * falla cuando la empresa está suspendida.
 */
export default async function SuspendedPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value ?? cookieStore.get('auth_token')?.value;
  if (!token) redirect('/login');

  let companyName = 'Tu empresa';
  let status = 'SUSPENDED';
  try {
    const payload = await verifySessionToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { company: { select: { businessName: true, status: true } } },
    });
    if (user?.company) {
      companyName = user.company.businessName;
      status = user.company.status;
      // Si volvió a estar operativa, no tiene sentido dejar al usuario acá.
      if (status === 'ACTIVE' || status === 'TRIAL') redirect('/dashboard');
    }
  } catch {
    redirect('/login');
  }

  const copy = STATUS_COPY[status] ?? STATUS_COPY.SUSPENDED!;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-muted/30 p-8 text-center">
        <div className="rounded-full bg-amber-500/10 p-3">
          <AlertTriangle className="size-7 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{companyName}</span> — {copy.message}
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}

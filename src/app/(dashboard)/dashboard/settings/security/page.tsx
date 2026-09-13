import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import SecurityClient from '@/components/settings/SecurityClient';

export const metadata = { title: 'Seguridad' };

export default function SecurityPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-tutorial="module-header">Seguridad</h1>
          <p className="text-sm text-muted-foreground">
            Verificación en dos pasos (2FA) para tu cuenta.
          </p>
        </div>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>
      <SecurityClient />
    </div>
  );
}

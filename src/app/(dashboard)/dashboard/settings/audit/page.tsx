import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import AuditLogClient from '@/components/settings/AuditLogClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Auditoría & Trazabilidad' };

export default async function AuditSettingsPage() {
  const context = await getAuthContext();
  const allowed = can(context, 'audit:read');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Auditoría & Trazabilidad</h1>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      {!allowed && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para ver el registro de auditoría. Esta sección está reservada para Dueños y Administradores.
        </p>
      )}
      {allowed && <AuditLogClient />}
    </div>
  );
}

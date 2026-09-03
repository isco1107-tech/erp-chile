import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import TeamClient from '@/components/settings/TeamClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Equipo & Colaboradores' };

export default async function TeamSettingsPage() {
  const context = await getAuthContext();
  const allowed = can(context, 'settings:users');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Equipo & Colaboradores</h1>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      {!allowed && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para gestionar el equipo. Esta sección está reservada para Dueños y Administradores.
        </p>
      )}
      {allowed && <TeamClient />}
    </div>
  );
}

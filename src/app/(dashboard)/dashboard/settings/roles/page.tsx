import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AuthError,
  TenantInactiveError,
  can,
  getAuthContext,
} from '@/lib/auth/guards';
import { listCustomRoles } from '@/modules/roles/services/roles.service';
import { PERMISSION_LABELS, isPermission } from '@/lib/auth/permissions';
import { buttonVariants } from '@/components/ui/button';
import RolesTable from '@/components/settings/RolesTable';

export const metadata = { title: 'Roles Personalizados' };

export default async function RolesSettingsPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  if (!can(context, 'settings:users')) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Roles Personalizados</h1>
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para gestionar roles. Esta sección está reservada para Dueños y Administradores.
        </p>
      </div>
    );
  }

  const roles = await listCustomRoles(context.companyId);
  const rows = roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description,
    userCount: role.userCount,
    // Se traducen en el servidor: las claves obsoletas se descartan aquí mismo.
    permissionLabels: role.permissions.filter(isPermission).map((key) => PERMISSION_LABELS[key]),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-tutorial="module-header">Roles Personalizados</h1>
          <p className="text-sm text-muted-foreground">
            Define qué puede hacer cada función dentro de los módulos de tu plan {context.planName}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/settings/users" className={buttonVariants({ variant: 'outline' })}>
            Equipo
          </Link>
          <Link href="/dashboard/settings/roles/new" className={buttonVariants()}>
            + Crear Rol
          </Link>
        </div>
      </div>

      <RolesTable roles={rows} />
    </div>
  );
}

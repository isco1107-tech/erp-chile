import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { availablePermissionGroups } from '@/lib/auth/modules';
import { getCustomRole } from '@/modules/roles/services/roles.service';
import { buttonVariants } from '@/components/ui/button';
import RoleBuilder from '@/components/settings/RoleBuilder';

export const metadata = { title: 'Editar Rol Personalizado' };

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  if (!can(context, 'settings:users')) redirect('/dashboard');

  const { id } = await params;
  const role = await getCustomRole(context.companyId, id);
  if (!role) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Editar “{role.name}”</h1>
        <Link href="/dashboard/settings/roles" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      <RoleBuilder
        groups={availablePermissionGroups(context.features)}
        planName={context.planName}
        role={{
          id: role.id,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
        }}
      />
    </div>
  );
}

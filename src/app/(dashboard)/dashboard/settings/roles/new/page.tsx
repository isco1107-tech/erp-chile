import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthError, TenantInactiveError, can, getAuthContext } from '@/lib/auth/guards';
import { availablePermissionGroups } from '@/lib/auth/modules';
import { buttonVariants } from '@/components/ui/button';
import RoleBuilder from '@/components/settings/RoleBuilder';

export const metadata = { title: 'Crear Rol Personalizado' };

export default async function NewRolePage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  if (!can(context, 'settings:users')) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Crear Rol Personalizado</h1>
        <Link href="/dashboard/settings/roles" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      <RoleBuilder groups={availablePermissionGroups(context.features)} planName={context.planName} />
    </div>
  );
}

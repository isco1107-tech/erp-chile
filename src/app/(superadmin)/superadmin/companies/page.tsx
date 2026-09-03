import { redirect } from 'next/navigation';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import TenantsClient from '@/components/superadmin/TenantsClient';

export const metadata = { title: 'Empresas' };

export default async function SuperAdminCompaniesPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) redirect('/dashboard');
    redirect('/login');
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Empresas</h1>
        <p className="text-sm text-muted-foreground">
          Cada fila es un tenant aislado. Suspender corta el acceso de todos sus usuarios en el siguiente request.
        </p>
      </div>
      <TenantsClient />
    </div>
  );
}

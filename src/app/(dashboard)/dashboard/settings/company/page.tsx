import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import CompanyProfileForm from '@/components/settings/CompanyProfileForm';
import IpAllowlistForm from '@/components/settings/IpAllowlistForm';
import { getCompanyProfileAction, getCompanySettingsAction } from '@/lib/actions/company';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Perfil de Empresa' };

export default async function CompanySettingsPage() {
  const context = await getAuthContext();
  const allowed = can(context, 'settings:company');
  const [result, settingsResult] = allowed ? await Promise.all([getCompanyProfileAction(), getCompanySettingsAction()]) : [null, null];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Perfil de Empresa</h1>
        <Link href="/dashboard/settings" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      {!allowed && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          No tienes permisos para editar el perfil de la empresa. Esta sección está reservada para Dueños y Administradores.
        </p>
      )}
      {allowed && result && !result.success && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{result.error}</p>
      )}
      {allowed && result?.success && settingsResult?.success && (
        <>
          <CompanyProfileForm company={result.data} settings={settingsResult.data} />
          <IpAllowlistForm settings={settingsResult.data} />
        </>
      )}
    </div>
  );
}

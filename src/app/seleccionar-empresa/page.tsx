import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { getAuthContext, AuthError, IpNotAllowedError, TenantInactiveError } from '@/lib/auth/guards';
import { listAccessibleCompanies, selectableCount } from '@/lib/auth/accessible-companies';
import { AuthCard, AuthCardHeader, AuthShell } from '@/components/auth/AuthShell';
import { CompanyPicker } from '@/components/auth/CompanyPicker';
import LogoutButton from '@/components/LogoutButton';

export const metadata = { title: 'Elige tu empresa' };

/**
 * Paso del login para quien trabaja en más de una empresa con el mismo
 * correo (empresa hogar + `CompanyMembership`). Vive fuera de `(dashboard)`,
 * igual que `/change-password`, y también se puede abrir después desde la
 * barra lateral para cambiar de empresa.
 */
export default async function SelectCompanyPage() {
  let context;
  try {
    context = await getAuthContext();
  } catch (error) {
    if (error instanceof TenantInactiveError) redirect('/suspended');
    if (error instanceof IpNotAllowedError) redirect('/login?reason=ip');
    if (error instanceof AuthError) redirect('/login');
    throw error;
  }

  // Una contraseña temporal se cambia antes de cualquier otra cosa.
  if (context.mustChangePassword) redirect('/change-password');

  const companies = await listAccessibleCompanies(context.id);
  if (selectableCount(companies) < 2) redirect('/dashboard');

  return (
    <AuthShell>
      <AuthCard>
        <AuthCardHeader
          icon={<Building2 className="size-5.5" strokeWidth={1.75} />}
          title="¿En qué empresa vas a trabajar?"
          description={
            <>
              Tu cuenta <span className="font-medium text-foreground">{context.email}</span> tiene acceso a varias empresas.
              Podrás cambiar cuando quieras desde el menú lateral.
            </>
          }
        />
        <CompanyPicker
          companies={companies.map((company) => ({
            id: company.id,
            name: company.name,
            isHome: company.isHome,
            isActive: company.id === context.companyId,
            available: company.operational,
          }))}
        />
        <div className="mt-6 flex justify-center">
          <LogoutButton className="text-muted-foreground hover:bg-muted hover:text-foreground" />
        </div>
      </AuthCard>
    </AuthShell>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import { getTenant } from '@/modules/platform/services/platform.service';
import { TENANT_STATUS_BADGE_CLASS, TENANT_STATUS_LABELS } from '@/modules/platform/schema';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { buttonVariants } from '@/components/ui/button';
import TenantModulesForm from '@/components/superadmin/TenantModulesForm';
import TenantMembershipsForm from '@/components/superadmin/TenantMembershipsForm';
import TenantIpAllowlistBreakGlass from '@/components/superadmin/TenantIpAllowlistBreakGlass';
import TenantDangerZone from '@/components/superadmin/TenantDangerZone';

export const metadata = { title: 'Configuración de Empresa' };

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) redirect('/dashboard');
    redirect('/login');
  }

  const { id } = await params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const { company } = tenant;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{company.businessName}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TENANT_STATUS_BADGE_CLASS[company.status]}`}>
              {TENANT_STATUS_LABELS[company.status]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            RUT {company.rut} · Registrada el {new Date(company.createdAt).toLocaleDateString('es-CL')} ·{' '}
            {tenant.customRoleCount} rol(es) personalizado(s)
          </p>
        </div>
        <Link href="/superadmin/companies" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>

      <TenantIpAllowlistBreakGlass companyId={company.id} initialEnabled={tenant.ipAllowlistEnabled} />

      <div className="rounded-xl border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">Administradores del tenant</h2>
        {tenant.admins.length === 0 ? (
          <p className="text-sm text-destructive">
            Esta empresa no tiene ningún Dueño ni Administrador: nadie puede gestionarla desde dentro.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tenant.admins.map((admin) => (
              <li key={admin.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{admin.name}</span>
                <span className="text-muted-foreground">{admin.email}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {ROLE_LABELS[admin.role as keyof typeof ROLE_LABELS] ?? admin.role}
                </span>
                {!admin.isActive && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Suspendido</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <TenantModulesForm
        companyId={company.id}
        companyName={company.businessName}
        initialStatus={company.status}
        initialPlanName={company.planName}
        initialMaxUsers={company.maxUsers}
        initialMaxWarehouses={company.maxWarehouses}
        initialFeatures={tenant.features}
        initialDisabledNavItems={tenant.disabledNavItems}
        userCount={tenant.userCount}
        warehouseCount={tenant.warehouseCount}
      />

      <TenantMembershipsForm companyId={company.id} />

      <TenantDangerZone companyId={company.id} companyName={company.businessName} />
    </div>
  );
}

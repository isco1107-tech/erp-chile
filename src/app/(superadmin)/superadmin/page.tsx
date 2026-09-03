import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, CheckCircle2, PauseCircle, Users } from 'lucide-react';
import { AuthError, requireSuperAdmin } from '@/lib/auth/guards';
import { getPlatformMetrics } from '@/modules/platform/services/platform.service';
import { buttonVariants } from '@/components/ui/button';

export const metadata = { title: 'Resumen de Plataforma' };

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function SuperAdminDashboardPage() {
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthError && error.status === 403) redirect('/dashboard');
    redirect('/login');
  }

  const metrics = await getPlatformMetrics();
  const pct = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Resumen de Plataforma</h1>
        <Link href="/superadmin/companies" className={buttonVariants({ variant: 'outline' })}>
          Gestionar empresas →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Empresas registradas"
          value={metrics.totalCompanies}
          hint={`${metrics.trialCompanies} en período de prueba`}
          icon={Building2}
        />
        <MetricCard
          label="Empresas activas"
          value={metrics.activeCompanies}
          hint={`${metrics.cancelledCompanies} canceladas`}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Empresas suspendidas"
          value={metrics.suspendedCompanies}
          hint="Sin acceso para sus usuarios"
          icon={PauseCircle}
        />
        <MetricCard
          label="Usuarios totales"
          value={metrics.totalUsers}
          hint={`${metrics.activeUsers} activos · ${metrics.superAdmins} superadmin`}
          icon={Users}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">Módulos más utilizados</h2>
          <div className="space-y-3">
            {metrics.moduleUsage.map((mod) => (
              <div key={mod.key}>
                <div className="flex items-center justify-between text-sm">
                  <span>{mod.label}</span>
                  <span className="text-muted-foreground">
                    {mod.enabled} / {metrics.totalCompanies} ({pct(mod.share)})
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: pct(mod.share) }} />
                </div>
              </div>
            ))}
            {metrics.moduleUsage.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin datos de módulos todavía.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <h2 className="mb-3 text-sm font-semibold">Empresas por plan</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium">Empresas</th>
              </tr>
            </thead>
            <tbody>
              {metrics.companiesByPlan.map((row) => (
                <tr key={row.planName} className="border-t border-border">
                  <td className="py-2">{row.planName}</td>
                  <td className="py-2">{row.count}</td>
                </tr>
              ))}
              {metrics.companiesByPlan.length === 0 && (
                <tr>
                  <td className="py-4 text-center text-muted-foreground" colSpan={2}>
                    Sin empresas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

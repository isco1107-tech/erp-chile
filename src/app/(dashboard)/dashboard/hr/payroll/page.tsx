import { PageHeader } from '@/components/ui/PageHeader';
import { PayrollPeriodsClient } from '@/components/hr/PayrollPeriodsClient';
import { MutualSetting } from '@/components/hr/MutualSetting';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getPayrollSettingsAction } from '@/modules/hr/actions/employee-finance.actions';

export const metadata = { title: 'Remuneraciones' };

export default async function PayrollPage() {
  const context = await getAuthContext();
  const settings = await getPayrollSettingsAction();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personas & Equipo"
        title="Remuneraciones"
        description="Liquidaciones mensuales con AFP, salud, seguro de cesantía, impuesto único y aportes del empleador. Cada mes guarda sus propios parámetros previsionales."
        actions={<MutualSetting initial={settings.success ? settings.data.mutualCode : 'ISL'} canWrite={can(context, 'payroll:write')} />}
      />
      <PayrollPeriodsClient canWrite={can(context, 'payroll:write')} />
    </div>
  );
}

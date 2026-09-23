import { PageHeader } from '@/components/ui/PageHeader';
import { PayrollPeriodsClient } from '@/components/hr/PayrollPeriodsClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Remuneraciones' };

export default async function PayrollPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personas & Equipo"
        title="Remuneraciones"
        description="Liquidaciones mensuales con AFP, salud, seguro de cesantía, impuesto único y aportes del empleador. Cada mes guarda sus propios parámetros previsionales."
      />
      <PayrollPeriodsClient canWrite={can(context, 'payroll:write')} />
    </div>
  );
}

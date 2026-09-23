import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { PayrollPeriodClient } from '@/components/hr/PayrollPeriodClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Período de remuneraciones' };

export default async function PayrollPeriodPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params;
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Remuneraciones"
        title="Período de remuneraciones"
        actions={
          <Link href="/dashboard/hr/payroll" className={buttonVariants({ variant: 'outline' })}>
            ← Todos los períodos
          </Link>
        }
      />
      <PayrollPeriodClient periodId={periodId} canWrite={can(context, 'payroll:write')} canClose={can(context, 'payroll:close')} />
    </div>
  );
}

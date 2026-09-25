import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import PrintButton from '@/components/PrintButton';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PayslipDocument } from '@/components/hr/PayslipDocument';
import { getPayslipDocument } from '@/modules/hr/services/payroll.service';

export const metadata = { title: 'Liquidación de sueldo' };

export default async function PayslipPage({ params }: { params: Promise<{ periodId: string; payslipId: string }> }) {
  const { periodId, payslipId } = await params;
  const context = await getAuthContext();
  if (!context.features.hasPayroll || !can(context, 'payroll:read')) return null;

  const slip = await getPayslipDocument(context.companyId, payslipId);
  if (!slip || slip.periodId !== periodId) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/dashboard/hr/payroll/${periodId}`} className={buttonVariants({ variant: 'outline' })}>
          ← Volver al período
        </Link>
        <PrintButton />
      </div>

      <PayslipDocument slip={slip} />
    </div>
  );
}

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmployeesClient } from '@/components/hr/EmployeesClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Trabajadores' };

export default async function EmployeesPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Personas & Equipo"
        title="Trabajadores"
        description="Ficha de cada trabajador dependiente: contrato, remuneración y previsión. Es la base de sus liquidaciones de sueldo."
        actions={
          <>
            <Link href="/dashboard/hr/payroll" className={buttonVariants({ variant: 'outline' })}>
              Remuneraciones
            </Link>
            <Link href="/dashboard/hr/leave" className={buttonVariants({ variant: 'outline' })}>
              Vacaciones
            </Link>
          </>
        }
      />
      <EmployeesClient canWrite={can(context, 'payroll:write')} />
    </div>
  );
}

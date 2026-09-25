import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getEmployeeProfileAction } from '@/modules/hr/actions/employee-finance.actions';
import EmployeeProfileClient from '@/components/hr/EmployeeProfileClient';

export const metadata = { title: 'Ficha del trabajador' };

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [context, result] = await Promise.all([getAuthContext(), getEmployeeProfileAction(id)]);
  if (!result.success) notFound();

  return (
    <div className="space-y-6">
      <Link href="/dashboard/hr" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Trabajadores
      </Link>
      <EmployeeProfileClient profile={result.data} canWrite={can(context, 'payroll:write')} canClose={can(context, 'payroll:close')} />
    </div>
  );
}

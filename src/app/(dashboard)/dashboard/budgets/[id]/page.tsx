import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getBudgetVsActualAction } from '@/modules/budgets/actions/budgets.actions';
import { buttonVariants } from '@/components/ui/button';
import { can, getAuthContext } from '@/lib/auth/guards';
import BudgetDetailClient from '@/components/budgets/BudgetDetailClient';
import DeleteBudgetButton from '@/components/budgets/DeleteBudgetButton';

export const metadata = { title: 'Presupuesto' };

export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getBudgetVsActualAction(id), getAuthContext()]);
  if (!result.success) notFound();

  const canWrite = can(context, 'budgets:write');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/budgets" className={buttonVariants({ variant: 'outline' })}>
          ← Volver a Presupuestos
        </Link>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/budgets/${id}/edit`} className={buttonVariants({ variant: 'default' })}>
              Editar presupuesto
            </Link>
            <DeleteBudgetButton budgetId={id} budgetName={result.data.budget.name} />
          </div>
        )}
      </div>

      <BudgetDetailClient initialData={result.data} canWrite={canWrite} />
    </div>
  );
}

import BudgetListClient from '@/components/budgets/BudgetListClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Presupuestos' };

export default async function BudgetsPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'budgets:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Presupuestos</h1>
      <BudgetListClient canWrite={canWrite} />
    </div>
  );
}

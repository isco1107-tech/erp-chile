import { notFound, redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getBudgetByIdAction } from '@/modules/budgets/actions/budgets.actions';
import BudgetForm from '@/components/budgets/BudgetForm';

export const metadata = { title: 'Editar Presupuesto' };

export default async function EditBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'budgets:write')) redirect(`/dashboard/budgets/${id}`);

  const result = await getBudgetByIdAction(id);
  if (!result.success) notFound();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Editar Presupuesto</h1>
      <BudgetForm editingBudget={result.data} />
    </div>
  );
}

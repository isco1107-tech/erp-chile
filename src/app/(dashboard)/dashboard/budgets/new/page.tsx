import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import BudgetForm from '@/components/budgets/BudgetForm';

export const metadata = { title: 'Nuevo Presupuesto' };

export default async function NewBudgetPage() {
  // El guard vive también aquí y no solo en la Server Action: sin esto un rol
  // sin `budgets:write` llenaba el formulario completo para recibir un 403 al
  // guardar. El layout del módulo ya cubrió el feature gate.
  const context = await getAuthContext();
  if (!can(context, 'budgets:write')) redirect('/dashboard/budgets');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nuevo Presupuesto</h1>
      <BudgetForm />
    </div>
  );
}

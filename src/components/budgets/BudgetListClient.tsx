'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { listBudgetsAction } from '@/modules/budgets/actions/budgets.actions';
import { BUDGET_STATUS_LABELS } from '@/modules/budgets/schema';
import type { BudgetWithLines } from '@/modules/budgets/services/budgets.service';
import { formatCurrency } from '@/lib/chile/tax';
import DeleteBudgetButton from './DeleteBudgetButton';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-blue-600/10 text-blue-600',
  CLOSED: 'bg-green-600/10 text-green-600',
};

export default function BudgetListClient({ canWrite }: { canWrite: boolean }) {
  const [budgets, setBudgets] = useState<BudgetWithLines[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const result = await listBudgetsAction();
    if (result.success) setBudgets(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canWrite && (
          <Link href="/dashboard/budgets/new" className={buttonVariants({ variant: 'default' })} data-tutorial="module-primary-action">
            Nuevo Presupuesto
          </Link>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {!loading && budgets.length === 0 && (
        <EmptyState
          title="Todavía no hay presupuestos"
          description="Crea el primer presupuesto por período para comparar lo planificado contra el gasto real."
          action={
            canWrite ? (
              <Link href="/dashboard/budgets/new" className={buttonVariants({ size: 'sm' })}>
                Nuevo Presupuesto
              </Link>
            ) : undefined
          }
        />
      )}

      {!loading && budgets.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nombre</th>
                <th className="px-3 py-2 text-left font-medium">Período</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Total planificado</th>
                <th className="px-3 py-2 text-right font-medium">Líneas</th>
                {canWrite && <th className="px-3 py-2 text-right font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget) => {
                const totalPlanned = budget.lines.reduce((sum, line) => sum + line.plannedAmount, 0);
                return (
                  <tr key={budget.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/budgets/${budget.id}`} className="font-medium hover:underline">
                        {budget.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(budget.periodStart).toLocaleDateString('es-CL')} —{' '}
                      {new Date(budget.periodEnd).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[budget.status]}`}>
                        {BUDGET_STATUS_LABELS[budget.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{formatCurrency(totalPlanned)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{budget.lines.length}</td>
                    {canWrite && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DeleteBudgetButton budgetId={budget.id} budgetName={budget.name} variant="icon" onDeleted={load} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

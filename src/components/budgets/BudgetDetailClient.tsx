'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import {
  addBudgetLineAction,
  deleteBudgetLineAction,
  getBudgetVsActualAction,
} from '@/modules/budgets/actions/budgets.actions';
import { BUDGET_STATUS_LABELS } from '@/modules/budgets/schema';
import type { BudgetVsActual } from '@/modules/budgets/services/budgets.service';
import { formatCurrency } from '@/lib/chile/tax';

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  ACTIVE: 'info',
  CLOSED: 'success',
};

interface Props {
  initialData: BudgetVsActual;
  canWrite: boolean;
}

export default function BudgetDetailClient({ initialData, canWrite }: Props) {
  const [data, setData] = useState<BudgetVsActual>(initialData);
  const [category, setCategory] = useState('');
  const [plannedAmount, setPlannedAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAddLine, setShowAddLine] = useState(false);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const [deleteLineTarget, setDeleteLineTarget] = useState<{ id: string; category: string } | null>(null);

  async function reload() {
    const result = await getBudgetVsActualAction(data.budget.id);
    if (result.success) setData(result.data);
    else toast.error(result.error);
  }

  async function handleAddLine() {
    if (!category.trim()) {
      toast.error('Ingrese la categoría de la línea');
      return;
    }
    if (plannedAmount <= 0) {
      toast.error('El monto planificado debe ser mayor a cero');
      return;
    }

    setSaving(true);
    try {
      const result = await addBudgetLineAction(data.budget.id, {
        category,
        plannedAmount,
        notes: notes || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Línea agregada');
      setCategory('');
      setPlannedAmount(0);
      setNotes('');
      setShowAddLine(false);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLine() {
    if (!deleteLineTarget) return;
    const { id } = deleteLineTarget;
    setDeletingLineId(id);
    try {
      const result = await deleteBudgetLineAction(id, data.budget.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Línea eliminada');
      setDeleteLineTarget(null);
      await reload();
    } finally {
      setDeletingLineId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-4xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-5">
          <div>
            <h2 className="text-lg font-bold">{data.budget.name}</h2>
            <p className="text-muted-foreground">
              {new Date(data.budget.periodStart).toLocaleDateString('es-CL')} —{' '}
              {new Date(data.budget.periodEnd).toLocaleDateString('es-CL')}
            </p>
            {data.budget.notes && <p className="mt-1 text-xs text-muted-foreground">{data.budget.notes}</p>}
          </div>
          <StatusBadge tone={STATUS_TONE[data.budget.status] ?? 'neutral'}>{BUDGET_STATUS_LABELS[data.budget.status]}</StatusBadge>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded border border-border p-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total planificado</p>
            <p className="text-base font-semibold">{formatCurrency(data.totals.plannedAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Total real</p>
            <p className="text-base font-semibold">{formatCurrency(data.totals.actualAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Desviación</p>
            <p className={`text-base font-semibold ${data.totals.deviation > 0 ? 'text-destructive' : 'text-success'}`}>
              {data.totals.deviation > 0 ? '+' : ''}
              {formatCurrency(data.totals.deviation)}
            </p>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">Líneas de presupuesto</h3>
            {canWrite && (
              <Button type="button" size="sm" variant="outline" onClick={() => setShowAddLine((s) => !s)}>
                {showAddLine ? 'Cancelar' : '+ Agregar línea'}
              </Button>
            )}
          </div>

          {showAddLine && (
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="line-category">Categoría</Label>
                <Input id="line-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ej: Arriendo" />
              </div>
              <div>
                <Label htmlFor="line-amount">Monto planificado</Label>
                <CurrencyInput id="line-amount" value={plannedAmount} onChange={setPlannedAmount} />
              </div>
              <div>
                <Label htmlFor="line-notes">Notas</Label>
                <Input id="line-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="sm:col-span-3">
                <Button type="button" size="sm" disabled={saving} onClick={handleAddLine}>
                  {saving ? 'Guardando...' : 'Guardar línea'}
                </Button>
              </div>
            </div>
          )}

          {data.lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Todavía no hay líneas en este presupuesto.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Categoría</th>
                    <th className="px-3 py-2 text-right font-medium">Planificado</th>
                    <th className="px-3 py-2 text-right font-medium">Real</th>
                    <th className="px-3 py-2 text-right font-medium">Desviación</th>
                    <th className="px-3 py-2 text-left font-medium">Avance</th>
                    {canWrite && <th className="px-3 py-2 text-right font-medium">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => {
                    const percent = line.plannedAmount > 0 ? Math.min(Math.round((line.actualAmount / line.plannedAmount) * 100), 100) : 0;
                    const overBudget = line.deviation > 0;
                    return (
                      <tr key={line.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <p className="font-medium">{line.category}</p>
                          {line.notes && <p className="text-xs text-muted-foreground">{line.notes}</p>}
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(line.plannedAmount)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(line.actualAmount)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${overBudget ? 'text-destructive' : 'text-success'}`}>
                          {overBudget ? '+' : ''}
                          {formatCurrency(line.deviation)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full rounded-full ${overBudget ? 'bg-destructive' : 'bg-success'}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </td>
                        {canWrite && (
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              disabled={deletingLineId === line.id}
                              onClick={() => setDeleteLineTarget({ id: line.id, category: line.category })}
                              aria-label={`Eliminar línea ${line.category}`}
                              title="Eliminar línea"
                              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
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
      </div>

      <ConfirmDialog
        open={deleteLineTarget !== null}
        onOpenChange={(open) => !open && setDeleteLineTarget(null)}
        title="Eliminar línea"
        description={
          deleteLineTarget ? `¿Eliminar la línea "${deleteLineTarget.category}"? Esta acción no se puede deshacer.` : ''
        }
        confirmLabel="Eliminar"
        loading={deletingLineId !== null}
        onConfirm={handleDeleteLine}
      />
    </div>
  );
}

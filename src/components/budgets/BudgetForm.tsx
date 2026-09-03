'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createBudgetAction,
  updateBudgetAction,
} from '@/modules/budgets/actions/budgets.actions';
import type { BudgetWithLines } from '@/modules/budgets/services/budgets.service';
import { BUDGET_STATUS_LABELS, BUDGET_STATUSES, budgetCreateSchema, budgetUpdateSchema } from '@/modules/budgets/schema';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface Props {
  /** Presente solo en /dashboard/budgets/[id]/edit: precarga el presupuesto y guarda edición en vez de crear uno nuevo. */
  editingBudget?: BudgetWithLines;
}

function toDateInputValue(date: Date | string): string {
  const d = new Date(date);
  return d.toISOString().slice(0, 10);
}

export default function BudgetForm({ editingBudget }: Props) {
  const router = useRouter();

  const [name, setName] = useState(editingBudget?.name ?? '');
  const [periodStart, setPeriodStart] = useState(editingBudget ? toDateInputValue(editingBudget.periodStart) : '');
  const [periodEnd, setPeriodEnd] = useState(editingBudget ? toDateInputValue(editingBudget.periodEnd) : '');
  const [status, setStatus] = useState<(typeof BUDGET_STATUSES)[number]>(editingBudget?.status ?? 'DRAFT');
  const [notes, setNotes] = useState(editingBudget?.notes ?? '');
  const [saving, setSaving] = useState(false);

  function buildPayload() {
    return {
      name,
      periodStart,
      periodEnd,
      status,
      notes: notes || undefined,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    const schema = editingBudget ? budgetUpdateSchema : budgetCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }

    setSaving(true);
    try {
      const result = editingBudget
        ? await updateBudgetAction(editingBudget.id, parsed.data)
        : await createBudgetAction(parsed.data);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Presupuesto guardado');
      router.push(`/dashboard/budgets/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Nombre del presupuesto</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Presupuesto operativo 2026" />
        </div>

        <div>
          <Label htmlFor="periodStart">Inicio del período</Label>
          <Input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="periodEnd">Término del período</Label>
          <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="status">Estado</Label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as (typeof BUDGET_STATUSES)[number])} className={selectClass}>
            {BUDGET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BUDGET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? 'Guardando...' : editingBudget ? 'Guardar cambios' : 'Crear presupuesto'}
        </Button>
      </div>
    </div>
  );
}

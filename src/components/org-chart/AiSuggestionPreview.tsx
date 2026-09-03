'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { applyOrgChartAssignmentsAction } from '@/modules/org-chart/actions/org-chart.actions';
import type { OrgChartSuggestion } from '@/modules/org-chart/services/suggest-hierarchy.service';
import type { JobPositionWithUsage, StaffFlatRow } from '@/modules/org-chart/services/org-chart.service';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface EditableRow {
  userId: string;
  managerId: string | null;
  jobPositionId: string | null;
  reasoning: string;
}

interface AiSuggestionPreviewProps {
  suggestions: OrgChartSuggestion[];
  staff: StaffFlatRow[];
  positions: JobPositionWithUsage[];
  onApplied: () => void;
  onCancel: () => void;
}

export default function AiSuggestionPreview({ suggestions, staff, positions, onApplied, onCancel }: AiSuggestionPreviewProps) {
  const [rows, setRows] = useState<EditableRow[]>(
    suggestions.map((s) => ({
      userId: s.userId,
      managerId: s.suggestedManagerId,
      jobPositionId: s.suggestedJobPositionId,
      reasoning: s.reasoning,
    }))
  );
  const [applying, setApplying] = useState(false);

  const staffById = new Map(staff.map((u) => [u.id, u]));

  function updateRow(userId: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((row) => (row.userId === userId ? { ...row, ...patch } : row)));
  }

  async function handleApply() {
    setApplying(true);
    try {
      const result = await applyOrgChartAssignmentsAction(
        rows.map((row) => ({ userId: row.userId, managerId: row.managerId, jobPositionId: row.jobPositionId }))
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Sugerencias aplicadas');
      if (result.data.failures.length > 0) {
        for (const failure of result.data.failures) {
          const person = staffById.get(failure.userId);
          toast.error(`${person?.name ?? failure.userId}: ${failure.error}`);
        }
      }
      onApplied();
    } finally {
      setApplying(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        La IA no generó sugerencias con los datos actuales.
        <div className="mt-2">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Sugerencia de organigrama (IA)</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Descartar
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-auto text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Colaborador</th>
              <th className="p-2 font-medium">Jefe sugerido</th>
              <th className="p-2 font-medium">Cargo sugerido</th>
              <th className="p-2 font-medium">Justificación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const person = staffById.get(row.userId);
              return (
                <tr key={row.userId} className="border-t border-border align-top">
                  <td className="p-2 font-medium">{person?.name ?? row.userId}</td>
                  <td className="p-2">
                    <select
                      className={selectClass}
                      value={row.managerId ?? ''}
                      onChange={(e) => updateRow(row.userId, { managerId: e.target.value || null })}
                    >
                      <option value="">— Sin jefe —</option>
                      {staff
                        .filter((u) => u.id !== row.userId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      className={selectClass}
                      value={row.jobPositionId ?? ''}
                      onChange={(e) => updateRow(row.userId, { jobPositionId: e.target.value || null })}
                    >
                      <option value="">— Sin cargo —</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{row.reasoning}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={applying}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleApply} disabled={applying}>
          {applying ? 'Aplicando...' : 'Aplicar cambios'}
        </Button>
      </div>
    </div>
  );
}

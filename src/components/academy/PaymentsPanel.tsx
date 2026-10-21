'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getPaymentBoardAction, listGroupsAction, setMonthPaidAction } from '@/modules/academy/actions/academy.actions';
import type { GroupRow, PaymentBoardRow } from '@/modules/academy/services/academy.service';
import { currentPeriod, fieldClass, periodLabel } from './shared';

export default function PaymentsPanel({ canWrite }: { canWrite: boolean }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState('');
  const [rows, setRows] = useState<PaymentBoardRow[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void listGroupsAction().then((result) => {
      if (result.success) setGroups(result.data);
    });
  }, []);

  const load = useCallback(async () => {
    if (!period) return;
    const result = await getPaymentBoardAction(period, groupId || undefined);
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, [period, groupId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(row: PaymentBoardRow) {
    setBusy(row.studentId);
    const typed = amounts[row.studentId]?.trim();
    const amount = typed ? Number(typed) : row.suggestedAmount ?? undefined;
    const result = await setMonthPaidAction({ studentId: row.studentId, period, paid: !row.paid, amount });
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Listo');
    await load();
  }

  const paidCount = rows.filter((r) => r.paid).length;
  const totalPaid = rows.reduce((sum, r) => sum + (r.paid?.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm font-medium">Mes<Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        <label className="space-y-1 text-sm font-medium">Grupo
          <select className={fieldClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Todos</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        {rows.length > 0 && <p className="pb-2 text-sm text-muted-foreground">{periodLabel(period)}: {paidCount} de {rows.length} pagaron · ${totalPaid.toLocaleString('es-CL')}</p>}
      </div>

      <section className="rounded-lg border border-border bg-card" aria-label="Mensualidades">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No hay alumnas con mensualidad en este mes" description="Aparecen las alumnas activas cuyo primer mes de cobro es este mes o uno anterior." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.studentId} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.fullName}</p>
                  {row.groupName && <p className="text-xs text-muted-foreground">{row.groupName}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.paid ? (
                    <StatusBadge tone="success">Pagada · ${row.paid.amount.toLocaleString('es-CL')}</StatusBadge>
                  ) : (
                    <>
                      <StatusBadge tone="danger">Pendiente</StatusBadge>
                      {canWrite && row.suggestedAmount === null && (
                        <Input aria-label={`Monto pagado por ${row.fullName}`} className="w-28" type="number" min={0} step={1} placeholder="Monto" value={amounts[row.studentId] ?? ''} onChange={(e) => setAmounts({ ...amounts, [row.studentId]: e.target.value })} />
                      )}
                    </>
                  )}
                  {canWrite && (
                    <Button size="sm" variant={row.paid ? 'ghost' : 'default'} disabled={busy === row.studentId || (!row.paid && row.suggestedAmount === null && !amounts[row.studentId])} onClick={() => toggle(row)}>
                      {row.paid ? 'Desmarcar' : 'Marcar pagada'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/chile/tax';
import { createPayrollPeriodAction, getPayrollPeriodsAction } from '@/modules/hr/actions/hr.actions';
import { periodLabel } from '@/modules/hr/schema';
import type { PeriodSummary } from '@/modules/hr/services/payroll.service';
import { PeriodParamsForm, type PeriodParamsValues } from './PeriodParamsForm';

export function PayrollPeriodsClient({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const [periods, setPeriods] = useState<PeriodSummary[] | null>(null);
  const [initial, setInitial] = useState<PeriodParamsValues | null>(null);
  const [values, setValues] = useState<PeriodParamsValues | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await getPayrollPeriodsAction();
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPeriods(result.data.periods);
    // Mes sugerido: el siguiente al último período, o el mes actual.
    const last = result.data.periods[0];
    const now = new Date();
    const next = last ? (last.month === 12 ? { year: last.year + 1, month: 1 } : { year: last.year, month: last.month + 1 }) : { year: now.getFullYear(), month: now.getMonth() + 1 };
    const suggested = result.data.suggested;
    setInitial({
      ...next,
      ufValue: suggested.ufValue,
      utmValue: suggested.utmValue,
      minimumWage: suggested.minimumWage,
      taxableCapUf: suggested.taxableCapUf,
      unemploymentCapUf: suggested.unemploymentCapUf,
      sisRateBps: suggested.sisRateBps,
      mutualRateBps: suggested.mutualRateBps,
      employerPensionRateBps: suggested.employerPensionRateBps,
      afpCommissionBps: suggested.afpCommissionBps,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    if (!values) return;
    setSaving(true);
    try {
      const result = await createPayrollPeriodAction(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Período abierto');
      setOpen(false);
      router.push(`/dashboard/hr/payroll/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (!periods) return <p className="text-sm text-muted-foreground">Cargando períodos…</p>;

  return (
    <div className="space-y-5">
      {canWrite && initial && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => {
              setValues(initial);
              setDialogKey((k) => k + 1);
              setOpen(true);
            }}
            data-tutorial="module-primary-action"
          >
            <CalendarPlus aria-hidden="true" />
            Abrir período
          </Button>
        </div>
      )}

      {periods.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState title="Aún no hay períodos de remuneraciones" description="Abre el primer mes, confirma la UF y la UTM y calcula las liquidaciones de tu equipo." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Período</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Trabajadores</th>
                <th className="px-3 py-2 text-right font-medium">Total imponible</th>
                <th className="px-3 py-2 text-right font-medium">Líquido a pagar</th>
                <th className="px-3 py-2 text-right font-medium">Costo empresa</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/hr/payroll/${period.id}`} className="font-medium text-foreground hover:underline">
                      {periodLabel(period.year, period.month)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={period.status === 'CLOSED' ? 'success' : 'warning'}>{period.status === 'CLOSED' ? 'Cerrado' : 'Borrador'}</StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{period.employeeCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(period.totalTaxable)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(period.totalNetPay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(period.totalEmployerCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {initial && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Abrir período de remuneraciones</DialogTitle>
              <DialogDescription>Los parámetros quedan guardados con el período: una liquidación cerrada siempre se podrá reproducir.</DialogDescription>
            </DialogHeader>
            <PeriodParamsForm key={dialogKey} initial={initial} editablePeriod onChange={setValues} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={saving} onClick={() => void handleCreate()}>
                {saving ? 'Abriendo…' : 'Abrir período'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

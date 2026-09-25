'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Banknote, Calculator, Download, FileText, Landmark, Lock, Receipt, Settings2, Trash2, Users } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import type { AfpInstitutionKey } from '@/lib/chile/payroll';
import {
  calculatePayrollAction,
  closePayrollPeriodAction,
  deletePayrollPeriodAction,
  getPayrollPeriodDetailAction,
  updatePayrollPeriodAction,
} from '@/modules/hr/actions/hr.actions';
import { periodLabel } from '@/modules/hr/schema';
import type { PeriodDetail } from '@/modules/hr/services/payroll.service';
import { PeriodParamsForm, type PeriodParamsValues } from './PeriodParamsForm';
import { cn } from '@/lib/utils';

interface Row {
  employeeId: string;
  fullName: string;
  rut: string;
  include: boolean;
  workedDays: number;
  overtimeHours: number;
  bonuses: number;
  advances: number;
  otherDeductions: number;
}

function rowsFromDetail(detail: PeriodDetail): Row[] {
  const fromSlips: Row[] = detail.payslips.map((slip) => ({
    employeeId: slip.employeeId,
    fullName: slip.employee.fullName,
    rut: slip.employee.rut,
    include: true,
    workedDays: slip.workedDays,
    overtimeHours: slip.overtimeHours,
    bonuses: slip.bonuses,
    // Solo lo tecleado a mano: los anticipos registrados en la ficha se suman al calcular.
    advances: slip.manualAdvances,
    otherDeductions: slip.otherDeductions,
  }));
  const pending: Row[] = detail.pendingEmployees.map((employee) => ({
    employeeId: employee.id,
    fullName: employee.fullName,
    rut: employee.rut,
    include: true,
    workedDays: employee.suggestedWorkedDays,
    overtimeHours: 0,
    bonuses: 0,
    advances: 0,
    otherDeductions: 0,
  }));
  return [...fromSlips, ...pending].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
}

function paramsFromDetail(detail: PeriodDetail): PeriodParamsValues {
  const { period } = detail;
  return {
    year: period.year,
    month: period.month,
    ufValue: period.ufValue,
    utmValue: period.utmValue,
    minimumWage: period.minimumWage,
    taxableCapUf: period.taxableCapUf,
    unemploymentCapUf: period.unemploymentCapUf,
    sisRateBps: period.sisRateBps,
    mutualRateBps: period.mutualRateBps,
    employerPensionRateBps: period.employerPensionRateBps,
    afpCommissionBps: period.afpCommissionBps as unknown as Record<AfpInstitutionKey, number>,
  };
}

export function PayrollPeriodClient({ periodId, canWrite, canClose }: { periodId: string; canWrite: boolean; canClose: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<PeriodDetail | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [paramsKey, setParamsKey] = useState(0);
  const [paramsValues, setParamsValues] = useState<PeriodParamsValues | null>(null);

  const load = useCallback(async () => {
    const result = await getPayrollPeriodDetailAction(periodId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setDetail(result.data);
    setRows(rowsFromDetail(result.data));
  }, [periodId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    const slips = detail?.payslips ?? [];
    const sum = (pick: (s: PeriodDetail['payslips'][number]) => number) => slips.reduce((acc, s) => acc + pick(s), 0);
    return {
      taxable: sum((s) => s.taxableIncome),
      net: sum((s) => s.netPay),
      employerCost: sum((s) => s.employerCost),
      previred: sum((s) => s.pensionAmount + s.healthAmount + s.unemploymentEmployee + s.employerSis + s.employerUnemployment + s.employerMutual + s.employerPension),
      tax: sum((s) => s.incomeTax),
    };
  }, [detail]);

  if (!detail) return <p className="text-sm text-muted-foreground">Cargando período…</p>;
  const { period } = detail;
  const draft = period.status === 'DRAFT';
  const editable = draft && canWrite;
  const slipByEmployee = new Map(detail.payslips.map((slip) => [slip.employeeId, slip]));

  function updateRow(employeeId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((row) => (row.employeeId === employeeId ? { ...row, ...patch } : row)));
  }

  async function calculate() {
    setBusy(true);
    try {
      const result = await calculatePayrollAction(periodId, {
        rows: rows.filter((r) => r.include).map(({ employeeId, workedDays, overtimeHours, bonuses, advances, otherDeductions }) => ({ employeeId, workedDays, overtimeHours, bonuses, advances, otherDeductions })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Liquidaciones calculadas');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function closePeriod() {
    const ok = await confirm({
      title: `¿Cerrar las remuneraciones de ${periodLabel(period.year, period.month)}?`,
      description: 'Las liquidaciones quedan congeladas y ya no se podrán recalcular. Verifica montos y parámetros antes de cerrar.',
      confirmLabel: 'Cerrar período',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await closePayrollPeriodAction(periodId);
      if (!result.success) toast.error(result.error);
      else toast.success(result.message ?? 'Período cerrado');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removePeriod() {
    const ok = await confirm({ title: '¿Eliminar este período en borrador?', description: 'Se borran también sus liquidaciones calculadas.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    const result = await deletePayrollPeriodAction(periodId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Eliminado');
    router.push('/dashboard/hr/payroll');
  }

  async function saveParams() {
    if (!paramsValues) return;
    const result = await updatePayrollPeriodAction(periodId, paramsValues);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Parámetros actualizados');
    setParamsOpen(false);
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={draft ? 'warning' : 'success'}>{draft ? 'Borrador: se puede recalcular' : 'Cerrado'}</StatusBadge>
        <span className="text-xs text-muted-foreground">
          UF {period.ufValue.toLocaleString('es-CL')} · UTM {formatCurrency(period.utmValue)} · Ingreso mínimo {formatCurrency(period.minimumWage)} · Tope {period.taxableCapUf.toLocaleString('es-CL')} UF
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {detail.payslips.length > 0 && (
            <a href={`/api/hr/payroll/${periodId}/export`} className={buttonVariants({ variant: 'outline' })}>
              <Download aria-hidden="true" />
              Libro de remuneraciones
            </a>
          )}
          {editable && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setParamsValues(paramsFromDetail(detail));
                setParamsKey((k) => k + 1);
                setParamsOpen(true);
              }}
            >
              <Settings2 aria-hidden="true" />
              Parámetros
            </Button>
          )}
          {draft && canClose && detail.payslips.length > 0 && (
            <Button type="button" disabled={busy} onClick={() => void closePeriod()}>
              <Lock aria-hidden="true" />
              Cerrar período
            </Button>
          )}
          {editable && (
            <Button type="button" variant="ghost" className="text-danger" onClick={() => void removePeriod()}>
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Trabajadores" value={String(detail.payslips.length)} icon={Users} tone="accent" />
        <KpiCard label="Total imponible" value={formatCurrency(totals.taxable)} icon={Receipt} tone="info" />
        <KpiCard label="Líquido a pagar" value={formatCurrency(totals.net)} icon={Banknote} tone="success" />
        <KpiCard label="A pagar en Previred" value={formatCurrency(totals.previred)} icon={Landmark} tone="warning" hint="trabajador + empleador" />
        <KpiCard label="Costo empresa" value={formatCurrency(totals.employerCost)} icon={Calculator} tone="accent" />
      </section>

      {editable && (
        <section className="rounded-lg border border-border bg-card shadow-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Planilla del mes</h2>
              <p className="text-xs text-muted-foreground">Ajusta lo variable de cada persona y calcula. Puedes recalcular cuantas veces quieras hasta cerrar.</p>
            </div>
            <Button type="button" disabled={busy || rows.every((r) => !r.include)} onClick={() => void calculate()}>
              <Calculator aria-hidden="true" />
              {busy ? 'Calculando…' : 'Calcular liquidaciones'}
            </Button>
          </header>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay trabajadores vigentes en este mes. Crea sus fichas en Trabajadores.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Incluir</th>
                    <th className="px-3 py-2 font-medium">Trabajador</th>
                    <th className="px-3 py-2 font-medium">Días</th>
                    <th className="px-3 py-2 font-medium">Horas extra</th>
                    <th className="px-3 py-2 font-medium">Bonos imponibles</th>
                    <th className="px-3 py-2 font-medium">Registrados en la ficha</th>
                    <th className="px-3 py-2 font-medium">Otros anticipos</th>
                    <th className="px-3 py-2 font-medium">Otros descuentos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.employeeId} className={cn('border-t border-border', !row.include && 'opacity-50')}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={row.include} onChange={(e) => updateRow(row.employeeId, { include: e.target.checked })} className="accent-primary" aria-label={`Incluir a ${row.fullName}`} />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{row.fullName}</p>
                        <p className="text-xs text-muted-foreground">{row.rut}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" min={0} max={30} value={row.workedDays} onChange={(e) => updateRow(row.employeeId, { workedDays: Number(e.target.value) })} className="w-20" aria-label="Días trabajados" />
                      </td>
                      <td className="px-3 py-2">
                        <Input type="number" min={0} step={0.5} value={row.overtimeHours} onChange={(e) => updateRow(row.employeeId, { overtimeHours: Number(e.target.value) })} className="w-20" aria-label="Horas extra" />
                      </td>
                      <td className="px-3 py-2">
                        <CurrencyInput value={row.bonuses} onChange={(v) => updateRow(row.employeeId, { bonuses: v })} className="w-32" aria-label="Bonos" />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {detail.registered[row.employeeId] ? (
                          <>
                            {detail.registered[row.employeeId]!.advances > 0 && <p className="tabular-nums">Anticipos {formatCurrency(detail.registered[row.employeeId]!.advances)}</p>}
                            {detail.registered[row.employeeId]!.loans > 0 && <p className="tabular-nums">Cuota préstamo {formatCurrency(detail.registered[row.employeeId]!.loans)}</p>}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <CurrencyInput value={row.advances} onChange={(v) => updateRow(row.employeeId, { advances: v })} className="w-32" aria-label="Otros anticipos" />
                      </td>
                      <td className="px-3 py-2">
                        <CurrencyInput value={row.otherDeductions} onChange={(v) => updateRow(row.employeeId, { otherDeductions: v })} className="w-32" aria-label="Otros descuentos" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {detail.payslips.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold text-foreground">Liquidaciones</h2>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Trabajador</th>
                  <th className="px-3 py-2 text-right font-medium">Imponible</th>
                  <th className="px-3 py-2 text-right font-medium">AFP</th>
                  <th className="px-3 py-2 text-right font-medium">Salud</th>
                  <th className="px-3 py-2 text-right font-medium">Impuesto</th>
                  <th className="px-3 py-2 text-right font-medium">Descuentos</th>
                  <th className="px-3 py-2 text-right font-medium">Líquido</th>
                  <th className="px-3 py-2 text-right font-medium">Costo empresa</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) => slipByEmployee.has(row.employeeId))
                  .map((row) => {
                    const slip = slipByEmployee.get(row.employeeId);
                    if (!slip) return null;
                    return (
                      <tr key={slip.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{slip.employee.fullName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(slip.taxableIncome)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(slip.pensionAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(slip.healthAmount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(slip.incomeTax)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(slip.totalDeductions)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(slip.netPay)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(slip.employerCost)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link href={`/dashboard/hr/payroll/${periodId}/payslips/${slip.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                            <FileText aria-hidden="true" />
                            Liquidación
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot className="border-t border-border bg-muted/40 font-semibold">
                <tr>
                  <td className="px-3 py-2">Totales</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.taxable)}</td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.tax)}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.net)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.employerCost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {detail.contributions.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-card" aria-label="Cotizaciones por institución">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Cotizaciones por institución</h2>
              <p className="text-xs text-muted-foreground">Lo que se paga en Previred (y el impuesto único en el F29). Úsalo para cuadrar la planilla de Previred antes de pagar.</p>
            </div>
            <a href={`/api/hr/payroll/${periodId}/contributions`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Download aria-hidden="true" />
              Planilla de cotizaciones
            </a>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Institución</th>
                  <th className="px-3 py-2 text-right font-medium">Trabajadores</th>
                  <th className="px-3 py-2 text-right font-medium">Cargo trabajador</th>
                  <th className="px-3 py-2 text-right font-medium">Cargo empleador</th>
                  <th className="px-3 py-2 text-right font-medium">Total a pagar</th>
                </tr>
              </thead>
              <tbody>
                {detail.contributions.map((line) => (
                  <tr key={line.institution} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{line.institution}</p>
                      <p className="text-xs text-muted-foreground">{line.detail}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{line.workers}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(line.employee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatCurrency(line.employer)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(line.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {paramsValues && (
        <Dialog open={paramsOpen} onOpenChange={setParamsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Parámetros de {periodLabel(period.year, period.month)}</DialogTitle>
              <DialogDescription>Después de guardarlos, vuelve a calcular para que las liquidaciones los usen.</DialogDescription>
            </DialogHeader>
            <PeriodParamsForm key={paramsKey} initial={paramsFromDetail(detail)} editablePeriod={false} onChange={setParamsValues} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setParamsOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void saveParams()}>
                Guardar parámetros
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

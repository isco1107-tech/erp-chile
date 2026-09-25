'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Calculator, FileText } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { TERMINATION_CAUSES, terminationCause, type SettlementComputation, type TerminationCauseCode } from '@/lib/chile/settlement';
import {
  cancelSettlementAction,
  finalizeSettlementAction,
  previewSettlementAction,
  saveSettlementAction,
  suggestSettlementAction,
} from '@/modules/hr/actions/employee-finance.actions';
import { SETTLEMENT_STATUS_LABELS } from '@/modules/hr/schema';
import type { EmployeeProfile } from '@/modules/hr/services/employee-finance.service';

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

interface FormState {
  terminationDate: string;
  cause: TerminationCauseCode;
  noticeGiven: boolean;
  monthlySalary: number;
  ufValue: string;
  vacationBusinessDays: string;
  pendingSalary: number;
  otherEarnings: number;
  otherDeductions: number;
  notes: string;
}

export function SettlementPanel({ profile, canWrite, canClose }: { profile: EmployeeProfile; canWrite: boolean; canClose: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { employee, settlements } = profile;
  const hasFinal = settlements.some((settlement) => settlement.status === 'FINAL');
  const [form, setForm] = useState<FormState>(() => ({
    terminationDate: employee.terminationDate ? new Date(employee.terminationDate).toISOString().slice(0, 10) : todayIso(),
    cause: 'ART_159_2',
    noticeGiven: true,
    monthlySalary: 0,
    ufValue: '',
    vacationBusinessDays: '0',
    pendingSalary: 0,
    otherEarnings: 0,
    otherDeductions: 0,
    notes: '',
  }));
  const [loanBalance, setLoanBalance] = useState(0);
  const [preview, setPreview] = useState<SettlementComputation | null>(null);
  const [saving, setSaving] = useState(false);

  // Sugerencias al cambiar la fecha de término: última remuneración, feriado pendiente, préstamos y UF.
  useEffect(() => {
    let cancelled = false;
    void suggestSettlementAction(employee.id, form.terminationDate).then((result) => {
      if (cancelled || !result.success) return;
      setLoanBalance(result.data.loanBalance);
      setForm((prev) => ({
        ...prev,
        monthlySalary: prev.monthlySalary || result.data.monthlySalary,
        ufValue: prev.ufValue || (result.data.ufValue ? String(result.data.ufValue).replace('.', ',') : ''),
        vacationBusinessDays: String(result.data.vacationBusinessDays).replace('.', ','),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [employee.id, form.terminationDate]);

  const payload = {
    employeeId: employee.id,
    terminationDate: form.terminationDate,
    cause: form.cause,
    noticeGiven: form.noticeGiven,
    monthlySalary: form.monthlySalary,
    ufValue: Number(form.ufValue.replace(/\./g, '').replace(',', '.')) || 0,
    vacationBusinessDays: Number(form.vacationBusinessDays.replace(',', '.')) || 0,
    pendingSalary: form.pendingSalary,
    otherEarnings: form.otherEarnings,
    otherDeductions: form.otherDeductions,
    notes: form.notes.trim() || undefined,
  };
  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    const parsed = JSON.parse(payloadKey) as typeof payload;
    if (parsed.ufValue <= 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewSettlementAction(parsed);
      if (!cancelled && result.success) setPreview(result.data);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // payloadKey resume el formulario completo.
  }, [payloadKey]);

  const cause = terminationCause(form.cause);

  async function save() {
    setSaving(true);
    try {
      const result = await saveSettlementAction(payload);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Finiquito guardado');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {settlements.length > 0 && (
          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Finiquitos">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Finiquitos</h2>
            <ul className="divide-y divide-border">
              {settlements.map((settlement) => (
                <li key={settlement.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{terminationCause(settlement.cause)?.label ?? settlement.cause}</p>
                    <p className="text-xs text-muted-foreground">
                      Término {formatDate(settlement.terminationDate)} · total {formatCurrency(settlement.totalAmount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={settlement.status === 'FINAL' ? 'success' : settlement.status === 'DRAFT' ? 'warning' : 'neutral'}>{SETTLEMENT_STATUS_LABELS[settlement.status]}</StatusBadge>
                    <Link href={`/dashboard/hr/settlements/${settlement.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      <FileText className="size-4" aria-hidden="true" /> Documento
                    </Link>
                    {settlement.status === 'DRAFT' && canClose && !hasFinal && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          if (!(await confirm({ title: '¿Dejar el finiquito como definitivo?', description: `Se registra el término de ${employee.fullName} el ${formatDate(settlement.terminationDate)}, sus préstamos quedan saldados y los anticipos pendientes se anulan.`, confirmLabel: 'Hacer definitivo' }))) return;
                          const result = await finalizeSettlementAction(settlement.id);
                          if (!result.success) toast.error(result.error);
                          else {
                            toast.success(result.message ?? 'Listo');
                            router.refresh();
                          }
                        }}
                      >
                        Hacer definitivo
                      </Button>
                    )}
                    {settlement.status === 'DRAFT' && canWrite && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const result = await cancelSettlementAction(settlement.id, employee.id);
                          if (!result.success) toast.error(result.error);
                          else {
                            toast.success(result.message ?? 'Anulado');
                            router.refresh();
                          }
                        }}
                      >
                        Anular
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canWrite && !hasFinal && (
          <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-label="Calcular finiquito">
            <div className="flex gap-3">
              <Calculator className="mt-0.5 size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold">Calcular finiquito</h2>
                <p className="text-sm text-muted-foreground">Los valores se precargan desde la ficha; revísalos antes de guardar.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="st-date">Fecha de término</Label>
                <Input id="st-date" type="date" value={form.terminationDate} onChange={(e) => setForm({ ...form, terminationDate: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="st-cause">Causal</Label>
                <select id="st-cause" className={nativeSelectClass} value={form.cause} onChange={(e) => setForm({ ...form, cause: e.target.value as TerminationCauseCode })}>
                  {TERMINATION_CAUSES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.article} · {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {cause?.notice && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="size-4 accent-primary" checked={form.noticeGiven} onChange={(e) => setForm({ ...form, noticeGiven: e.target.checked })} />
                  Se avisó con 30 días de anticipación (si no, se paga la indemnización sustitutiva)
                </label>
              )}
              <div>
                <Label htmlFor="st-salary">Última remuneración mensual</Label>
                <CurrencyInput id="st-salary" value={form.monthlySalary} onChange={(value) => setForm({ ...form, monthlySalary: value })} />
                <p className="mt-1 text-xs text-muted-foreground">Sueldo + gratificación + asignaciones fijas</p>
              </div>
              <div>
                <Label htmlFor="st-uf">Valor UF al término</Label>
                <Input id="st-uf" inputMode="decimal" value={form.ufValue} placeholder="Ej. 39.485,65" onChange={(e) => setForm({ ...form, ufValue: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">Para el tope de 90 UF</p>
              </div>
              <div>
                <Label htmlFor="st-vacation">Feriado pendiente (días hábiles)</Label>
                <Input id="st-vacation" inputMode="decimal" value={form.vacationBusinessDays} onChange={(e) => setForm({ ...form, vacationBusinessDays: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="st-pending">Remuneraciones pendientes</Label>
                <CurrencyInput id="st-pending" value={form.pendingSalary} onChange={(value) => setForm({ ...form, pendingSalary: value })} />
              </div>
              <div>
                <Label htmlFor="st-other">Otros haberes</Label>
                <CurrencyInput id="st-other" value={form.otherEarnings} onChange={(value) => setForm({ ...form, otherEarnings: value })} />
              </div>
              <div>
                <Label htmlFor="st-deductions">Otros descuentos</Label>
                <CurrencyInput id="st-deductions" value={form.otherDeductions} onChange={(value) => setForm({ ...form, otherDeductions: value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="st-notes">Observaciones (van en el documento)</Label>
                <textarea id="st-notes" className={textareaClass} value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </section>
        )}
        {hasFinal && <p className="text-sm text-muted-foreground">Este trabajador ya tiene un finiquito definitivo.</p>}
      </div>

      {canWrite && !hasFinal && (
        <aside className="h-fit space-y-3 rounded-lg border border-border bg-card p-5 shadow-card xl:sticky xl:top-20" aria-label="Resultado">
          <h2 className="text-sm font-semibold">Resultado</h2>
          {!preview ? (
            <p className="text-sm text-muted-foreground">Ingresa el valor de la UF para calcular.</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              <Row label={`Años de servicio (${preview.yearsOfService} × ${formatCurrency(preview.severanceBase)})`} value={preview.severanceAmount} muted={!cause?.severance} />
              <Row label="Sustitutiva del aviso previo" value={preview.noticeIndemnity} muted={!cause?.notice} />
              <Row label={`Feriado (${preview.vacationBusinessDays.toLocaleString('es-CL')} hábiles = ${preview.vacationCalendarDays.toLocaleString('es-CL')} corridos)`} value={preview.vacationAmount} />
              <Row label="Remuneraciones pendientes" value={preview.pendingSalary} />
              <Row label="Otros haberes" value={preview.otherEarnings} />
              <div className="flex justify-between border-t border-border pt-1.5 font-medium">
                <dt>Total haberes</dt>
                <dd className="tabular-nums">{formatCurrency(preview.totalEarnings)}</dd>
              </div>
              <Row label="Saldo de préstamos" value={-preview.loanBalance} />
              <Row label="Otros descuentos" value={-preview.otherDeductions} />
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <dt>Total a pagar</dt>
                <dd className={preview.totalAmount < 0 ? 'text-danger tabular-nums' : 'tabular-nums'}>{formatCurrency(preview.totalAmount)}</dd>
              </div>
            </dl>
          )}
          {loanBalance > 0 && <p className="text-xs text-muted-foreground">Incluye el saldo de préstamos vigentes ({formatCurrency(loanBalance)}).</p>}
          <p className="text-xs text-muted-foreground">El feriado se convierte a días corridos sumando fines de semana; si en ese período hay feriados legales, agrégalos a los días hábiles.</p>
          <Button type="button" className="w-full" disabled={saving || !preview} onClick={save}>
            {saving ? 'Guardando…' : 'Guardar como borrador'}
          </Button>
        </aside>
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? 'text-muted-foreground' : ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value < 0 ? `−${formatCurrency(-value)}` : formatCurrency(value)}</dd>
    </div>
  );
}

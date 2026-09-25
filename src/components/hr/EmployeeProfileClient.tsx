'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Banknote, CalendarDays, FileText, HandCoins, Hourglass, Link2, Plus, TreePalm } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import {
  cancelAdvanceAction,
  closeLoanAction,
  createAdvanceAction,
  createLoanAction,
  createPortalLinkAction,
  revokePortalLinkAction,
} from '@/modules/hr/actions/employee-finance.actions';
import { ADVANCE_STATUS_LABELS, CONTRACT_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, LOAN_STATUS_LABELS, periodLabel } from '@/modules/hr/schema';
import type { EmployeeProfile } from '@/modules/hr/services/employee-finance.service';
import { SettlementPanel } from './SettlementPanel';

type Tab = 'loans' | 'payslips' | 'vacation' | 'settlement' | 'portal';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'loans', label: 'Préstamos y anticipos' },
  { value: 'payslips', label: 'Liquidaciones' },
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'settlement', label: 'Finiquito' },
  { value: 'portal', label: 'Portal del trabajador' },
];

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

function tenure(hireDate: Date | string, end: Date | string | null): string {
  const start = new Date(hireDate);
  const finish = end ? new Date(end) : null;
  if (!finish) return '';
  const months = (finish.getUTCFullYear() - start.getUTCFullYear()) * 12 + finish.getUTCMonth() - start.getUTCMonth() - (finish.getUTCDate() < start.getUTCDate() ? 1 : 0);
  const years = Math.floor(Math.max(0, months) / 12);
  const rest = Math.max(0, months) % 12;
  return [years ? `${years} año${years === 1 ? '' : 's'}` : '', rest ? `${rest} mes${rest === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' y ') || 'menos de un mes';
}

function currentMonth(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }).slice(0, 7);
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

interface Props {
  profile: EmployeeProfile;
  canWrite: boolean;
  canClose: boolean;
}

export default function EmployeeProfileClient({ profile, canWrite, canClose }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('loans');
  const [dialog, setDialog] = useState<'loan' | 'advance' | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  // Referencia "hoy" fijada al montar, para calcular antigüedad sin leer el reloj en cada render.
  const [now] = useState(() => new Date().toISOString());
  const { employee, loans, advances, vacation } = profile;
  const loanBalance = loans.reduce((sum, loan) => sum + loan.balance, 0);
  const pendingAdvances = advances.filter((advance) => advance.status === 'PENDING').reduce((sum, advance) => sum + advance.amount, 0);

  async function run(action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>) {
    const result = await action();
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    if (result.message) toast.success(result.message);
    router.refresh();
    return true;
  }

  async function generatePortal() {
    if (profile.hasPortal && !(await confirm({ title: '¿Generar un enlace nuevo?', description: 'El enlace anterior dejará de funcionar.', confirmLabel: 'Generar' }))) return;
    const result = await createPortalLinkAction(employee.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setPortalUrl(`${window.location.origin}/trabajador/${result.data.token}`);
    toast.success(result.message ?? 'Enlace generado');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trabajador"
        title={employee.fullName}
        description={`${employee.position}${employee.department ? ` · ${employee.department}` : ''} · RUT ${employee.rut} · ${CONTRACT_TYPE_LABELS[employee.contractType]} desde el ${formatDate(employee.hireDate)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={employee.status === 'ACTIVE' ? 'success' : 'neutral'}>{employee.status === 'ACTIVE' ? 'Vigente' : `Término ${formatDate(employee.terminationDate)}`}</StatusBadge>
            <Link href={`/dashboard/hr/employees/${employee.id}/documentos?tipo=contrato`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <FileText className="size-4" aria-hidden="true" /> Contrato
            </Link>
            <Link href={`/dashboard/hr/employees/${employee.id}/documentos?tipo=antiguedad`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Certificado de antigüedad
            </Link>
            <Link href={`/dashboard/hr/employees/${employee.id}/documentos?tipo=renta`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Certificado de remuneraciones
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sueldo base" value={formatCurrency(employee.baseSalary)} icon={Banknote} tone="accent" hint={`${employee.weeklyHours} h semanales`} />
        <KpiCard label="Antigüedad" value={tenure(employee.hireDate, employee.terminationDate ?? now)} icon={Hourglass} tone="info" hint={`Desde el ${formatDate(employee.hireDate)}`} />
        <KpiCard label="Vacaciones disponibles" value={`${vacation.available.toLocaleString('es-CL', { maximumFractionDigits: 2 })} días`} icon={TreePalm} tone={vacation.available > 30 ? 'warning' : 'success'} hint={`${vacation.taken} tomados · ${vacation.pending} por aprobar`} />
        <KpiCard label="Préstamos por pagar" value={formatCurrency(loanBalance)} icon={HandCoins} tone={loanBalance > 0 ? 'warning' : 'neutral'} hint={pendingAdvances > 0 ? `+ ${formatCurrency(pendingAdvances)} en anticipos` : 'Sin anticipos pendientes'} />
      </div>

      <div role="tablist" aria-label="Secciones" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn('rounded px-3 py-1.5 text-xs font-medium transition-colors', tab === item.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'loans' && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Préstamos">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Préstamos de la empresa</h2>
                <p className="text-xs text-muted-foreground">Se descuenta una cuota en cada liquidación cerrada.</p>
              </div>
              {canWrite && employee.status === 'ACTIVE' && (
                <Button type="button" size="sm" onClick={() => setDialog('loan')}>
                  <Plus className="size-4" aria-hidden="true" /> Préstamo
                </Button>
              )}
            </header>
            {loans.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin préstamos.</p>
            ) : (
              <ul className="divide-y divide-border">
                {loans.map((loan) => (
                  <li key={loan.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{loan.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(loan.principal)} en {loan.installments} cuota{loan.installments === 1 ? '' : 's'} de {formatCurrency(loan.installmentAmount)} · desde {periodLabel(loan.startYear, loan.startMonth)} · {loan.paidInstallments}/{loan.installments} pagadas
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{formatCurrency(loan.balance)}</p>
                        <StatusBadge tone={loan.status === 'ACTIVE' ? 'warning' : loan.status === 'PAID' ? 'success' : 'neutral'}>{LOAN_STATUS_LABELS[loan.status]}</StatusBadge>
                      </div>
                      {canWrite && loan.status === 'ACTIVE' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const paidSome = loan.paidInstallments > 0;
                            if (!(await confirm({ title: paidSome ? '¿Saldar el préstamo?' : '¿Anular el préstamo?', description: paidSome ? 'Se deja de descontar: úsalo si el trabajador pagó el saldo por otra vía.' : 'Aún no tiene cuotas descontadas.', confirmLabel: paidSome ? 'Saldar' : 'Anular' }))) return;
                            await run(() => closeLoanAction(loan.id, employee.id));
                          }}
                        >
                          {loan.paidInstallments > 0 ? 'Saldar' : 'Anular'}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Anticipos">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Anticipos de sueldo</h2>
                <p className="text-xs text-muted-foreground">Se descuentan solos en la liquidación del mes indicado.</p>
              </div>
              {canWrite && employee.status === 'ACTIVE' && (
                <Button type="button" size="sm" onClick={() => setDialog('advance')}>
                  <Plus className="size-4" aria-hidden="true" /> Anticipo
                </Button>
              )}
            </header>
            {advances.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin anticipos.</p>
            ) : (
              <ul className="divide-y divide-border">
                {advances.map((advance) => (
                  <li key={advance.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium tabular-nums">{formatCurrency(advance.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        Pagado el {formatDate(advance.paidDate)} · se descuenta en {periodLabel(advance.year, advance.month)}
                        {advance.notes && ` · ${advance.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge tone={advance.status === 'PENDING' ? 'warning' : advance.status === 'DEDUCTED' ? 'success' : 'neutral'}>{ADVANCE_STATUS_LABELS[advance.status]}</StatusBadge>
                      {canWrite && advance.status === 'PENDING' && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => run(() => cancelAdvanceAction(advance.id, employee.id))}>
                          Anular
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'payslips' && (
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Liquidaciones">
          {profile.payslips.length === 0 ? (
            <EmptyState title="Aún no tiene liquidaciones" description="Aparecerán al calcular su primer mes en Remuneraciones." />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Mes</th>
                  <th className="px-4 py-2.5 text-right font-medium">Imponible</th>
                  <th className="px-4 py-2.5 text-right font-medium">Impuesto</th>
                  <th className="px-4 py-2.5 text-right font-medium">Líquido</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profile.payslips.map((slip) => (
                  <tr key={slip.id}>
                    <td className="px-4 py-2.5">
                      {periodLabel(slip.period.year, slip.period.month)}
                      {slip.period.status !== 'CLOSED' && <span className="ml-2 text-xs text-warning">borrador</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(slip.taxableIncome)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(slip.incomeTax)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(slip.netPay)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/dashboard/hr/payroll/${slip.period.id}/payslips/${slip.id}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'vacation' && (
        <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Vacaciones">
          <div className="grid grid-cols-2 gap-4 border-b border-border p-4 sm:grid-cols-4">
            {[
              ['Devengados', vacation.accrued],
              ['Tomados', vacation.taken],
              ['Por aprobar', vacation.pending],
              ['Disponibles', vacation.available],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold tabular-nums">{(value as number).toLocaleString('es-CL', { maximumFractionDigits: 2 })} días</p>
              </div>
            ))}
          </div>
          {profile.leaves.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin solicitudes de vacaciones ni permisos.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.leaves.map((leave) => (
                <li key={leave.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{LEAVE_TYPE_LABELS[leave.type]}</span>
                    <span className="ml-2 text-muted-foreground">
                      {formatDate(leave.startDate)} al {formatDate(leave.endDate)} · {leave.businessDays} día{leave.businessDays === 1 ? '' : 's'} hábiles
                    </span>
                  </span>
                  <StatusBadge tone={leave.status === 'APPROVED' ? 'success' : leave.status === 'PENDING' ? 'warning' : 'neutral'}>{LEAVE_STATUS_LABELS[leave.status]}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-border px-4 py-3">
            <Link href="/dashboard/hr/leave" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <CalendarDays className="size-4" aria-hidden="true" /> Ir a Vacaciones & Permisos
            </Link>
          </div>
        </section>
      )}

      {tab === 'settlement' && <SettlementPanel profile={profile} canWrite={canWrite} canClose={canClose} />}

      {tab === 'portal' && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card" aria-label="Portal del trabajador">
          <div className="flex gap-3">
            <Link2 className="mt-0.5 size-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">Enlace personal al portal</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Con este enlace {employee.fullName.split(' ')[0]} ve y descarga sus liquidaciones cerradas, revisa su saldo de vacaciones y pide días, sin usuario ni contraseña. Compártelo solo con la persona: quien tenga el enlace ve sus datos.
              </p>
            </div>
          </div>
          <p className="text-sm">
            Estado:{' '}
            {profile.hasPortal ? (
              <StatusBadge tone="success">Enlace activo{employee.portalTokenCreatedAt ? ` desde el ${formatDate(employee.portalTokenCreatedAt)}` : ''}</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Sin enlace</StatusBadge>
            )}
          </p>
          {portalUrl && (
            <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-accent/40 p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate text-xs">{portalUrl}</code>
              <Button
                type="button"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(portalUrl);
                  toast.success('Enlace copiado');
                }}
              >
                Copiar
              </Button>
            </div>
          )}
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generatePortal}>
                {profile.hasPortal ? 'Generar enlace nuevo' : 'Generar enlace'}
              </Button>
              {profile.hasPortal && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (!(await confirm({ title: '¿Revocar el enlace?', description: 'El trabajador dejará de poder entrar al portal.', confirmLabel: 'Revocar', destructive: true }))) return;
                    if (await run(() => revokePortalLinkAction(employee.id))) setPortalUrl(null);
                  }}
                >
                  Revocar
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {dialog === 'loan' && <LoanDialog employeeId={employee.id} onClose={() => setDialog(null)} onSaved={() => router.refresh()} />}
      {dialog === 'advance' && <AdvanceDialog employeeId={employee.id} maxAmount={employee.baseSalary} onClose={() => setDialog(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}

function LoanDialog({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState('Préstamo personal');
  const [principal, setPrincipal] = useState(0);
  const [installments, setInstallments] = useState(3);
  const [start, setStart] = useState(currentMonth);
  const [saving, setSaving] = useState(false);
  const installment = installments > 0 ? Math.floor(principal / installments) : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const [year, month] = start.split('-').map(Number);
      const result = await createLoanAction({ employeeId, description, principal, installments, startYear: year, startMonth: month });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Préstamo registrado');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nuevo préstamo</DialogTitle>
            <DialogDescription>Las cuotas se descuentan del líquido en cada liquidación, a partir del mes indicado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="loan-desc">Descripción</Label>
              <Input id="loan-desc" value={description} maxLength={160} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="loan-principal">Monto</Label>
                <CurrencyInput id="loan-principal" value={principal} onChange={setPrincipal} />
              </div>
              <div>
                <Label htmlFor="loan-installments">Cuotas</Label>
                <Input id="loan-installments" type="number" min={1} max={60} value={installments} onChange={(e) => setInstallments(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
              </div>
            </div>
            <div>
              <Label htmlFor="loan-start">Primer descuento</Label>
              <Input id="loan-start" type="month" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            {principal > 0 && (
              <p className="text-sm text-muted-foreground">
                {installments} cuota{installments === 1 ? '' : 's'} de {formatCurrency(installment)}
                {installments > 1 && principal - installment * installments !== 0 && ` (la última de ${formatCurrency(principal - installment * (installments - 1))})`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || principal <= 0}>{saving ? 'Guardando…' : 'Registrar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDialog({ employeeId, maxAmount, onClose, onSaved }: { employeeId: string; maxAmount: number; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(0);
  const [paidDate, setPaidDate] = useState(todayIso);
  const [period, setPeriod] = useState(currentMonth);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const [year, month] = period.split('-').map(Number);
      const result = await createAdvanceAction({ employeeId, amount, paidDate, year, month, notes: notes.trim() || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Anticipo registrado');
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nuevo anticipo</DialogTitle>
            <DialogDescription>Por ejemplo, la quincena. Se descuenta solo en la liquidación del mes que elijas.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="adv-amount">Monto</Label>
              <CurrencyInput id="adv-amount" value={amount} onChange={setAmount} />
              {amount > maxAmount && <p className="mt-1 text-xs text-danger">Supera el sueldo base</p>}
            </div>
            <div>
              <Label htmlFor="adv-date">Pagado el</Label>
              <Input id="adv-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="adv-period">Descontar en</Label>
              <Input id="adv-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="adv-notes">Nota (opcional)</Label>
              <Input id="adv-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || amount <= 0 || amount > maxAmount}>{saving ? 'Guardando…' : 'Registrar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

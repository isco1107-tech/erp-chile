'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { businessDaysBetween } from '@/lib/chile/payroll';
import { formatShortDate } from '@/lib/intelligence/format';
import { cancelLeaveRequestAction, createLeaveRequestAction, getLeaveBoardAction, reviewLeaveRequestAction } from '@/modules/hr/actions/hr.actions';
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, LEAVE_TYPES } from '@/modules/hr/schema';
import type { LeaveRow, VacationBalance } from '@/modules/hr/services/leave.service';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<LeaveRow['status'], Tone> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' };
const fmtDays = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function LeaveClient({ canWrite, canApprove }: { canWrite: boolean; canApprove: boolean }) {
  const confirm = useConfirm();
  const [data, setData] = useState<{ requests: LeaveRow[]; balances: VacationBalance[]; employees: Array<{ id: string; fullName: string }> } | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: '', type: 'VACATION' as (typeof LEAVE_TYPES)[number], startDate: '', endDate: '', businessDays: '', reason: '' });
  const [reviewing, setReviewing] = useState<{ row: LeaveRow; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const load = useCallback(async () => {
    const result = await getLeaveBoardAction();
    if (result.success) setData(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const computedDays = useMemo(() => {
    if (!form.startDate || !form.endDate) return null;
    return businessDaysBetween(new Date(form.startDate), new Date(form.endDate));
  }, [form.startDate, form.endDate]);

  const selectedBalance = data?.balances.find((b) => b.employeeId === form.employeeId);
  const requestedDays = form.businessDays !== '' ? Number(form.businessDays) : (computedDays ?? 0);

  async function submit() {
    const result = await createLeaveRequestAction({
      employeeId: form.employeeId,
      type: form.type,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      businessDays: form.businessDays !== '' ? Number(form.businessDays) : undefined,
      reason: form.reason,
    });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Solicitud registrada');
    setOpen(false);
    await load();
  }

  async function review() {
    if (!reviewing) return;
    const result = await reviewLeaveRequestAction(reviewing.row.id, { decision: reviewing.decision, notes: reviewNotes });
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Revisada');
    setReviewing(null);
    await load();
  }

  async function cancel(row: LeaveRow) {
    if (!(await confirm({ title: '¿Anular esta solicitud?', description: 'Si estaba aprobada, los días vuelven al saldo del trabajador.', confirmLabel: 'Anular' }))) return;
    const result = await cancelLeaveRequestAction(row.id);
    if (!result.success) toast.error(result.error);
    else toast.success(result.message ?? 'Anulada');
    await load();
  }

  if (!data) return <p className="text-sm text-muted-foreground">Cargando solicitudes…</p>;
  const requests = filter === 'PENDING' ? data.requests.filter((r) => r.status === 'PENDING') : data.requests;
  const pendingCount = data.requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="grid grid-cols-12 gap-5">
      <section className="col-span-12 space-y-4 xl:col-span-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
            {(
              [
                ['PENDING', `Por aprobar (${pendingCount})`],
                ['ALL', 'Todas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn('rounded-md px-3 py-1', filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
          {canWrite && (
            <Button
              type="button"
              className="ml-auto"
              onClick={() => {
                setForm({ employeeId: data.employees[0]?.id ?? '', type: 'VACATION', startDate: '', endDate: '', businessDays: '', reason: '' });
                setOpen(true);
              }}
              disabled={data.employees.length === 0}
              data-tutorial="module-primary-action"
            >
              <Plus aria-hidden="true" />
              Nueva solicitud
            </Button>
          )}
        </div>

        {requests.length === 0 ? (
          <div className="rounded-lg border border-border bg-card shadow-card">
            <EmptyState title={filter === 'PENDING' ? 'Nada por aprobar' : 'Sin solicitudes'} description="Las solicitudes de vacaciones y permisos aparecerán aquí con su estado." />
          </div>
        ) : (
          <ul className="space-y-2">
            {requests.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-card">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{row.employee.fullName}</p>
                    <StatusBadge tone={STATUS_TONE[row.status]}>{LEAVE_STATUS_LABELS[row.status]}</StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {LEAVE_TYPE_LABELS[row.type]} · {formatShortDate(row.startDate)} al {formatShortDate(row.endDate)} · {row.businessDays} día(s) hábil(es)
                  </p>
                  {row.reason && <p className="text-xs text-muted-foreground">Motivo: {row.reason}</p>}
                  {row.reviewedBy && (
                    <p className="text-xs text-muted-foreground">
                      Revisada por {row.reviewedBy.name}
                      {row.reviewNotes ? `: ${row.reviewNotes}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {row.status === 'PENDING' && canApprove && (
                    <>
                      <Button type="button" size="sm" onClick={() => { setReviewing({ row, decision: 'APPROVED' }); setReviewNotes(''); }}>
                        <Check aria-hidden="true" />
                        Aprobar
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setReviewing({ row, decision: 'REJECTED' }); setReviewNotes(''); }}>
                        <X aria-hidden="true" />
                        Rechazar
                      </Button>
                    </>
                  )}
                  {(row.status === 'PENDING' || row.status === 'APPROVED') && canWrite && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void cancel(row)}>
                      Anular
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="col-span-12 rounded-lg border border-border bg-card p-4 shadow-card xl:col-span-4">
        <h2 className="text-base font-semibold text-foreground">Saldo de vacaciones</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Días hábiles devengados menos los aprobados. No incluye feriado progresivo.</p>
        <ul className="mt-3 divide-y divide-border">
          {data.balances.length === 0 && <li className="py-3 text-sm text-muted-foreground">Sin trabajadores activos.</li>}
          {data.balances.map((balance) => (
            <li key={balance.employeeId} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{balance.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  Devengados {fmtDays(balance.accrued)} · tomados {fmtDays(balance.taken)}
                  {balance.pending > 0 && ` · ${fmtDays(balance.pending)} por aprobar`}
                </p>
              </div>
              <span className={cn('shrink-0 text-sm font-semibold tabular-nums', balance.available < 0 ? 'text-danger' : 'text-foreground')}>{fmtDays(balance.available)} d</span>
            </li>
          ))}
        </ul>
      </aside>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva solicitud</DialogTitle>
            <DialogDescription>Queda pendiente hasta que una jefatura la apruebe o rechace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="leave-employee">Trabajador</Label>
              <select id="leave-employee" className={nativeSelectClass} value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>
                {data.employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="leave-type">Tipo</Label>
              <select id="leave-type" className={nativeSelectClass} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as (typeof LEAVE_TYPES)[number] }))}>
                {LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {LEAVE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="leave-start">Desde</Label>
                <Input id="leave-start" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="leave-end">Hasta</Label>
                <Input id="leave-end" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="leave-days">Días hábiles</Label>
              <Input
                id="leave-days"
                type="number"
                min={0}
                value={form.businessDays}
                placeholder={computedDays === null ? '' : `${computedDays} (calculado, sin feriados)`}
                onChange={(e) => setForm((f) => ({ ...f, businessDays: e.target.value }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">Ajústalo si el rango incluye feriados.</p>
            </div>
            <div>
              <Label htmlFor="leave-reason">Motivo (opcional)</Label>
              <Input id="leave-reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
            {form.type === 'VACATION' && selectedBalance && (
              <p className={cn('rounded-md px-3 py-2 text-xs', requestedDays > selectedBalance.available ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>
                Saldo disponible: {fmtDays(selectedBalance.available)} días.
                {requestedDays > selectedBalance.available && ' La solicitud excede el saldo: se requeriría un anticipo de vacaciones pactado.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={!form.employeeId || !form.startDate || !form.endDate}>
              Registrar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewing !== null} onOpenChange={(value) => !value && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewing?.decision === 'APPROVED' ? 'Aprobar solicitud' : 'Rechazar solicitud'}</DialogTitle>
            <DialogDescription>
              {reviewing && `${reviewing.row.employee.fullName} · ${LEAVE_TYPE_LABELS[reviewing.row.type]} · ${reviewing.row.businessDays} día(s)`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="review-notes">Comentario (opcional)</Label>
            <Input id="review-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewing(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void review()}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

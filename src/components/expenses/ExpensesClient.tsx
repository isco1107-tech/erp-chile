'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Check, CheckCircle2, Clock, HandCoins, Plus, ReceiptText, Send, Trash2, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { RutInput } from '@/components/ui/RutInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { formatShortDate } from '@/lib/intelligence/format';
import {
  addExpenseItemAction,
  createExpenseReportAction,
  deleteExpenseReportAction,
  getExpenseReportAction,
  getExpensesBoardAction,
  reimburseExpenseReportAction,
  removeExpenseItemAction,
  reviewExpenseReportAction,
  submitExpenseReportAction,
  type ExpensesBoard,
} from '@/modules/expenses/actions/expenses.actions';
import { EXPENSE_CATEGORIES, EXPENSE_DOCUMENT_LABELS, EXPENSE_DOCUMENT_TYPES, EXPENSE_STATUS_LABELS } from '@/modules/expenses/schema';
import type { ExpenseReportDetail, ExpenseReportRow } from '@/modules/expenses/services/expenses.service';
import { cn } from '@/lib/utils';
import { PAYMENT_METHOD_TYPES, PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import { pickDefaultAccount as defaultAccountFor, type MoneyMethod } from '@/components/treasury/MoneyMovementDialog';

type Status = ExpenseReportRow['status'];
const STATUS_TONE: Record<Status, Tone> = { DRAFT: 'neutral', SUBMITTED: 'warning', APPROVED: 'info', REJECTED: 'danger', REIMBURSED: 'success' };
const FLOW: Status[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REIMBURSED'];

type Tab = 'mine' | 'review' | 'reimburse' | 'all';

const EMPTY_ITEM = { expenseDate: '', category: EXPENSE_CATEGORIES[0] as string, description: '', documentType: 'BOLETA' as (typeof EXPENSE_DOCUMENT_TYPES)[number], documentNumber: '', supplierName: '', supplierRut: '', amount: 0 };

/** Paso a paso del flujo; una rechazada se dibuja volviendo a borrador. */
function FlowStepper({ status }: { status: Status }) {
  const currentIndex = status === 'REJECTED' ? 0 : FLOW.indexOf(status);
  return (
    <ol className="flex items-center gap-1 text-[11px]">
      {FLOW.map((step, index) => (
        <li key={step} className="flex items-center gap-1">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-medium',
              index < currentIndex ? 'bg-success-soft text-success' : index === currentIndex ? (status === 'REJECTED' ? 'bg-danger-soft text-danger' : 'bg-primary text-primary-foreground') : 'bg-muted text-muted-foreground'
            )}
          >
            {index === currentIndex && status === 'REJECTED' ? 'Rechazada · corregir' : EXPENSE_STATUS_LABELS[step]}
          </span>
          {index < FLOW.length - 1 && <span className="text-muted-foreground/50">→</span>}
        </li>
      ))}
    </ol>
  );
}

export function ExpensesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [board, setBoard] = useState<ExpensesBoard | null>(null);
  const [tab, setTab] = useState<Tab>('mine');
  const [createOpen, setCreateOpen] = useState(false);
  const [newReport, setNewReport] = useState({ title: '', projectId: '' });
  const [detail, setDetail] = useState<ExpenseReportDetail | null>(null);
  const [item, setItem] = useState(EMPTY_ITEM);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reference, setReference] = useState('');
  const [reimburseMethod, setReimburseMethod] = useState<MoneyMethod>('TRANSFERENCIA');
  const [reimburseAccount, setReimburseAccount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await getExpensesBoardAction();
    if (result.success) setBoard(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewReport({ title: '', projectId: '' });
      setCreateOpen(true);
      router.replace('/dashboard/expenses');
    }
  }, [searchParams, router]);

  async function openDetail(id: string) {
    const result = await getExpenseReportAction(id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setDetail(result.data);
    setItem(EMPTY_ITEM);
    setReviewNotes('');
    setReference('');
    setReimburseMethod('TRANSFERENCIA');
    setReimburseAccount(defaultAccountFor(board?.treasuryAccounts ?? [], 'TRANSFERENCIA'));
  }

  async function refreshDetail() {
    if (detail) await openDetail(detail.id);
    await load();
  }

  async function run(action: () => Promise<{ success: boolean; error?: string; message?: string }>, after?: () => Promise<void> | void) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo completar');
        return false;
      }
      if (result.message) toast.success(result.message);
      await after?.();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const tabs = useMemo(() => {
    const list: Array<{ key: Tab; label: string }> = [{ key: 'mine', label: 'Mis rendiciones' }];
    if (board?.canApprove) list.push({ key: 'review', label: `Por aprobar (${board.summary.pendingReviewCount})` });
    if (board?.canReimburse) list.push({ key: 'reimburse', label: 'Por reembolsar' });
    if (board?.canApprove || board?.canReimburse) list.push({ key: 'all', label: 'Todas' });
    return list;
  }, [board]);

  if (!board) return <p className="text-sm text-muted-foreground">Cargando rendiciones…</p>;

  const reports = board.reports.filter((report) => {
    if (tab === 'mine') return report.submittedByUserId === board.currentUserId;
    if (tab === 'review') return report.status === 'SUBMITTED';
    if (tab === 'reimburse') return report.status === 'APPROVED';
    return true;
  });
  const categoryTotal = board.summary.byCategory.reduce((s, c) => s + c.amount, 0);
  const isMine = detail?.submittedByUserId === board.currentUserId;
  const editable = Boolean(detail && isMine && (detail.status === 'DRAFT' || detail.status === 'REJECTED'));

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Esperando aprobación" value={formatCurrency(board.summary.pendingReviewAmount)} icon={Clock} tone="warning" trend={`${board.summary.pendingReviewCount} rendiciones`} hint="enviadas" />
        <KpiCard label="Aprobado por reembolsar" value={formatCurrency(board.summary.toReimburseAmount)} icon={Wallet} tone="info" />
        <KpiCard label="Reembolsado este mes" value={formatCurrency(board.summary.reimbursedThisMonth)} icon={HandCoins} tone="success" />
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <p className="text-[13px] text-muted-foreground">Gasto por categoría (90 días)</p>
          <div className="mt-3 space-y-2">
            {board.summary.byCategory.length === 0 && <p className="text-xs text-muted-foreground">Sin gastos aprobados todavía.</p>}
            {board.summary.byCategory.slice(0, 4).map((c, index) => (
              <ProgressRow key={c.category} label={c.category} value={categoryTotal ? (c.amount / categoryTotal) * 100 : 0} color={`var(--chart-${(index % 5) + 1})`} />
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5 text-sm">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn('rounded-md px-3 py-1', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          className="ml-auto"
          onClick={() => {
            setNewReport({ title: '', projectId: '' });
            setCreateOpen(true);
          }}
          data-tutorial="module-primary-action"
        >
          <Plus aria-hidden="true" />
          Nueva rendición
        </Button>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState title="No hay rendiciones aquí" description={tab === 'mine' ? 'Crea una rendición, agrega tus boletas y envíala a aprobación.' : 'Nada pendiente en esta bandeja.'} icon={<ReceiptText className="size-10 text-muted-foreground/40" strokeWidth={1.5} />} />
        </div>
      ) : (
        <ul className="space-y-2">
          {reports.map((report) => (
            <li key={report.id}>
              <button type="button" onClick={() => void openDetail(report.id)} className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-card transition-shadow hover:shadow-hover">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{report.title}</p>
                    <StatusBadge tone={STATUS_TONE[report.status]}>{EXPENSE_STATUS_LABELS[report.status]}</StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {report.submittedBy?.name ?? 'Usuario eliminado'} · {report._count.items} gasto(s)
                    {report.project ? ` · ${report.project.name}` : ''}
                    {report.submittedAt ? ` · enviada ${formatShortDate(report.submittedAt)}` : ''}
                  </p>
                </div>
                <span className="text-lg font-semibold tabular-nums text-foreground">{formatCurrency(report.totalAmount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva rendición</DialogTitle>
            <DialogDescription>Agrupa los gastos de un viaje, un evento o un período. Después agregas cada boleta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="report-title">Nombre</Label>
              <Input id="report-title" value={newReport.title} onChange={(e) => setNewReport((r) => ({ ...r, title: e.target.value }))} placeholder="Ej.: Visita a clientes en Temuco" />
            </div>
            {board.projects.length > 0 && (
              <div>
                <Label htmlFor="report-project">Proyecto o evento (opcional)</Label>
                <select id="report-project" className={nativeSelectClass} value={newReport.projectId} onChange={(e) => setNewReport((r) => ({ ...r, projectId: e.target.value }))}>
                  <option value="">Sin proyecto</option>
                  {board.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await createExpenseReportAction(newReport);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(result.message ?? 'Creada');
                  setCreateOpen(false);
                  await load();
                  await openDetail(result.data.id);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title}</DialogTitle>
                <DialogDescription>
                  {detail.submittedBy?.name ?? 'Usuario eliminado'}
                  {detail.project ? ` · ${detail.project.name}` : ''} · Total {formatCurrency(detail.totalAmount)}
                </DialogDescription>
              </DialogHeader>
              <FlowStepper status={detail.status} />
              {detail.reviewNotes && (
                <p className={cn('mt-3 rounded-md px-3 py-2 text-sm', detail.status === 'REJECTED' ? 'bg-danger-soft text-danger' : 'bg-muted text-foreground')}>
                  {detail.reviewedBy?.name ?? 'Revisor'}: {detail.reviewNotes}
                </p>
              )}
              {detail.reimbursementReference && <p className="mt-2 text-xs text-muted-foreground">Reembolso: {detail.reimbursementReference}</p>}

              <div className="mt-4 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Gasto</th>
                      <th className="px-3 py-2 font-medium">Documento</th>
                      <th className="px-3 py-2 text-right font-medium">Monto</th>
                      {editable && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Sin gastos todavía.
                        </td>
                      </tr>
                    )}
                    {detail.items.map((expense) => (
                      <tr key={expense.id} className="border-t border-border">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatShortDate(expense.expenseDate)}</td>
                        <td className="px-3 py-2">
                          <p className="text-foreground">{expense.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {expense.category}
                            {expense.supplierName ? ` · ${expense.supplierName}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {EXPENSE_DOCUMENT_LABELS[expense.documentType]}
                          {expense.documentNumber ? ` N° ${expense.documentNumber}` : ''}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(expense.amount)}</td>
                        {editable && (
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              aria-label="Quitar gasto"
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                              onClick={() => void run(() => removeExpenseItemAction(detail.id, expense.id), refreshDetail)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {editable && (
                <div className="mt-3 space-y-3 rounded-md border border-dashed border-border p-3">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Agregar gasto</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <Input type="date" aria-label="Fecha" value={item.expenseDate} onChange={(e) => setItem((i) => ({ ...i, expenseDate: e.target.value }))} />
                    <select aria-label="Categoría" className={nativeSelectClass} value={item.category} onChange={(e) => setItem((i) => ({ ...i, category: e.target.value }))}>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <Input aria-label="Descripción" className="sm:col-span-2" value={item.description} onChange={(e) => setItem((i) => ({ ...i, description: e.target.value }))} placeholder="Descripción" />
                    <select aria-label="Tipo de documento" className={nativeSelectClass} value={item.documentType} onChange={(e) => setItem((i) => ({ ...i, documentType: e.target.value as typeof i.documentType }))}>
                      {EXPENSE_DOCUMENT_TYPES.map((d) => (
                        <option key={d} value={d}>
                          {EXPENSE_DOCUMENT_LABELS[d]}
                        </option>
                      ))}
                    </select>
                    <Input aria-label="N° documento" value={item.documentNumber} onChange={(e) => setItem((i) => ({ ...i, documentNumber: e.target.value }))} placeholder="N° documento" />
                    <Input aria-label="Comercio" value={item.supplierName} onChange={(e) => setItem((i) => ({ ...i, supplierName: e.target.value }))} placeholder="Comercio" />
                    <RutInput aria-label="RUT del comercio" value={item.supplierRut} onChange={(rut) => setItem((i) => ({ ...i, supplierRut: rut }))} placeholder="RUT (opcional)" />
                    <CurrencyInput aria-label="Monto" value={item.amount} onChange={(v) => setItem((i) => ({ ...i, amount: v }))} placeholder="Monto total" />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => addExpenseItemAction(detail.id, { ...item, expenseDate: item.expenseDate || undefined }),
                        async () => {
                          setItem(EMPTY_ITEM);
                          await refreshDetail();
                        }
                      )
                    }
                  >
                    <Plus aria-hidden="true" />
                    Agregar
                  </Button>
                </div>
              )}

              {detail.status === 'SUBMITTED' && board.canApprove && !isMine && (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="review-notes">Comentario (obligatorio si rechazas)</Label>
                  <Input id="review-notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
                </div>
              )}
              {detail.status === 'APPROVED' && board.canReimburse && (
                <div className="mt-4 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
                  <p className="text-xs text-muted-foreground sm:col-span-3">
                    El reembolso de {formatCurrency(detail.totalAmount)} queda registrado como egreso en Tesorería.
                  </p>
                  <div>
                    <Label htmlFor="reimburse-method">Medio de pago</Label>
                    <select
                      id="reimburse-method"
                      className={nativeSelectClass}
                      value={reimburseMethod}
                      onChange={(e) => {
                        const next = e.target.value as MoneyMethod;
                        setReimburseMethod(next);
                        setReimburseAccount(defaultAccountFor(board.treasuryAccounts, next));
                      }}
                    >
                      {PAYMENT_METHOD_TYPES.map((method) => (
                        <option key={method} value={method}>
                          {PAYMENT_METHOD_TYPE_LABELS[method]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="reimburse-account">Sale de</Label>
                    <select id="reimburse-account" className={nativeSelectClass} value={reimburseAccount} onChange={(e) => setReimburseAccount(e.target.value)}>
                      <option value="">Sin especificar</option>
                      {board.treasuryAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="reimburse-ref">N° de comprobante</Label>
                    <Input id="reimburse-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
                  </div>
                </div>
              )}

              <DialogFooter className="flex-wrap">
                {isMine && detail.status === 'DRAFT' && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto text-danger"
                    onClick={async () => {
                      if (!(await confirm({ title: '¿Eliminar esta rendición?', confirmLabel: 'Eliminar' }))) return;
                      await run(() => deleteExpenseReportAction(detail.id), async () => {
                        setDetail(null);
                        await load();
                      });
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    Eliminar
                  </Button>
                )}
                {editable && (
                  <Button type="button" disabled={busy || detail.items.length === 0} onClick={() => void run(() => submitExpenseReportAction(detail.id), refreshDetail)}>
                    <Send aria-hidden="true" />
                    Enviar a aprobación
                  </Button>
                )}
                {detail.status === 'SUBMITTED' && board.canApprove && !isMine && (
                  <>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => reviewExpenseReportAction(detail.id, { decision: 'REJECTED', notes: reviewNotes }), refreshDetail)}>
                      <X aria-hidden="true" />
                      Rechazar
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void run(() => reviewExpenseReportAction(detail.id, { decision: 'APPROVED', notes: reviewNotes }), refreshDetail)}>
                      <Check aria-hidden="true" />
                      Aprobar
                    </Button>
                  </>
                )}
                {detail.status === 'SUBMITTED' && isMine && <p className="mr-auto text-xs text-muted-foreground">Esperando revisión de otra persona.</p>}
                {detail.status === 'APPROVED' && board.canReimburse && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          reimburseExpenseReportAction(detail.id, {
                            paymentMethod: reimburseMethod,
                            treasuryAccountId: reimburseAccount || undefined,
                            referenceNumber: reference.trim() || undefined,
                          }),
                        refreshDetail
                      )
                    }
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Marcar reembolsada
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileCheck2, Plus, Search } from 'lucide-react';
import type { ChequeDirection, ChequeStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass } from '@/components/ui/field-classes';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { CHILEAN_BANKS, bankName } from '@/lib/treasury/banks';
import { cn } from '@/lib/utils';
import { bounceChequeAction, clearChequeAction, createChequeAction, depositChequeAction, listChequesAction, voidChequeAction } from '@/modules/treasury/actions/cheques.actions';
import { listPayablesAction, listReceivablesAction } from '@/modules/treasury/actions/treasury.actions';
import { CHEQUE_STATUS_LABELS } from '@/modules/treasury/schema';
import type { ChequeRow } from '@/modules/treasury/services/cheques.service';

type StatusFilter = ChequeStatus | 'OPEN' | 'ALL';

const STATUS_TONE: Record<ChequeStatus, Tone> = { PORTFOLIO: 'info', DEPOSITED: 'warning', CLEARED: 'success', BOUNCED: 'danger', VOIDED: 'neutral' };

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'OPEN', label: 'Pendientes' },
  { value: 'CLEARED', label: 'Cobrados' },
  { value: 'BOUNCED', label: 'Protestados' },
  { value: 'ALL', label: 'Todos' },
];

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }) : '—';
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

type Action = { kind: 'deposit' | 'clear' | 'bounce' | 'void'; cheque: ChequeRow } | null;

interface Props {
  bankAccounts: { id: string; name: string; isDefault: boolean }[];
  canWrite: boolean;
}

export default function ChequesClient({ bankAccounts, canWrite }: Props) {
  const router = useRouter();
  const [direction, setDirection] = useState<ChequeDirection>('RECEIVED');
  const [filter, setFilter] = useState<StatusFilter>('OPEN');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ChequeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action>(null);
  // "Hoy" se fija al cargar, para marcar cheques ya cobrables sin leer el reloj al renderizar.
  const [today, setToday] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await listChequesAction(direction, filter, query.trim() || undefined);
      if (cancelled) return;
      if (result.success) {
        setRows(result.data);
        setToday(todayIso());
      } else toast.error(result.error);
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [direction, filter, query, reload]);

  function refresh() {
    setReload((value) => value + 1);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Cheques">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Tipo" className="inline-flex rounded-md bg-muted p-0.5">
              {(['RECEIVED', 'ISSUED'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={direction === value}
                  onClick={() => setDirection(value)}
                  className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', direction === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {value === 'RECEIVED' ? 'Recibidos' : 'Girados'}
                </button>
              ))}
            </div>
            <select aria-label="Estado" className={cn(nativeSelectClass, 'h-8 w-40')} value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
              {FILTERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="N° de cheque, girador o cliente" aria-label="Buscar cheque" className="h-9 pl-8 sm:w-64" />
            </div>
            {canWrite && (
              <Button type="button" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden="true" /> Registrar cheque
              </Button>
            )}
          </div>
        </div>

        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={<FileCheck2 className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title={query ? 'Sin resultados' : direction === 'RECEIVED' ? 'No hay cheques recibidos en esta vista' : 'No hay cheques girados en esta vista'}
            description={query ? 'Prueba con otro número o nombre.' : 'Al registrar un cheque que paga un documento, el documento queda abonado; si luego se protesta, vuelve a quedar por cobrar.'}
            actionLabel={canWrite && !query ? 'Registrar cheque' : undefined}
            onAction={canWrite && !query ? () => setCreating(true) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">N° / Banco</th>
                  <th className="px-4 py-2.5 font-medium">{direction === 'RECEIVED' ? 'Cliente / girador' : 'Proveedor'}</th>
                  <th className="px-4 py-2.5 font-medium">Documento</th>
                  <th className="px-4 py-2.5 font-medium">Fecha de cobro</th>
                  <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  {canWrite && <th className="px-4 py-2.5 text-right font-medium">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={canWrite ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td>
                  </tr>
                )}
                {rows.map((cheque) => {
                  const due = new Date(cheque.dueDate).toISOString().slice(0, 10);
                  const cashable = cheque.status === 'PORTFOLIO' && today !== '' && due <= today;
                  return (
                    <tr key={cheque.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs font-medium">N° {cheque.number}</span>
                        <p className="text-xs text-muted-foreground">{bankName(cheque.bankCode)}</p>
                      </td>
                      <td className="max-w-[240px] px-4 py-2.5">
                        <p className="truncate font-medium">{cheque.contact?.razonSocial ?? cheque.drawerName ?? '—'}</p>
                        {cheque.drawerName && cheque.contact && cheque.drawerName !== cheque.contact.razonSocial && <p className="truncate text-xs text-muted-foreground">Girado por {cheque.drawerName}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{cheque.documentLabel ?? 'Sin documento'}</td>
                      <td className={cn('px-4 py-2.5 tabular-nums', cashable ? 'font-medium text-warning' : 'text-muted-foreground')}>
                        {formatDate(cheque.dueDate)}
                        {cashable && <span className="ml-1 text-xs">· cobrable</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(cheque.amount)}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={STATUS_TONE[cheque.status]}>{CHEQUE_STATUS_LABELS[cheque.direction][cheque.status]}</StatusBadge>
                        {cheque.status === 'DEPOSITED' && cheque.bankAccount && <p className="mt-0.5 text-xs text-muted-foreground">en {cheque.bankAccount.name}</p>}
                        {cheque.status === 'BOUNCED' && cheque.bounceReason && <p className="mt-0.5 max-w-[180px] truncate text-xs text-muted-foreground">{cheque.bounceReason}</p>}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            {cheque.direction === 'RECEIVED' && cheque.status === 'PORTFOLIO' && (
                              <Button type="button" size="sm" variant="outline" onClick={() => setAction({ kind: 'deposit', cheque })}>Depositar</Button>
                            )}
                            {(cheque.status === 'DEPOSITED' || (cheque.direction === 'ISSUED' && cheque.status === 'PORTFOLIO')) && (
                              <Button type="button" size="sm" variant="outline" onClick={() => setAction({ kind: 'clear', cheque })}>Cobrado</Button>
                            )}
                            {cheque.direction === 'RECEIVED' && (cheque.status === 'PORTFOLIO' || cheque.status === 'DEPOSITED' || cheque.status === 'CLEARED') && (
                              <Button type="button" size="sm" variant="ghost" onClick={() => setAction({ kind: 'bounce', cheque })}>Protestar</Button>
                            )}
                            {cheque.status === 'PORTFOLIO' && (
                              <Button type="button" size="sm" variant="ghost" onClick={() => setAction({ kind: 'void', cheque })}>Anular</Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && <ChequeFormDialog direction={direction} bankAccounts={bankAccounts} onClose={() => setCreating(false)} onDone={refresh} />}
      {action && <ChequeActionDialog action={action} bankAccounts={bankAccounts} onClose={() => setAction(null)} onDone={refresh} />}
    </div>
  );
}

interface DocOption {
  id: string;
  contactId: string;
  contactName: string;
  label: string;
  pending: number;
}

function ChequeFormDialog({
  direction: initialDirection,
  bankAccounts,
  onClose,
  onDone,
}: {
  direction: ChequeDirection;
  bankAccounts: Props['bankAccounts'];
  onClose: () => void;
  onDone: () => void;
}) {
  const [direction, setDirection] = useState<ChequeDirection>(initialDirection);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [docQuery, setDocQuery] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [form, setForm] = useState(() => ({
    number: '',
    bankCode: '012',
    drawerName: '',
    drawerRut: '',
    amount: 0,
    issueDate: todayIso(),
    dueDate: todayIso(),
    bankAccountId: (bankAccounts.find((account) => account.isDefault) ?? bankAccounts[0])?.id ?? '',
    notes: '',
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = direction === 'RECEIVED' ? listReceivablesAction() : listPayablesAction();
    void load.then((result) => {
      if (cancelled || !result.success) return;
      setDocs(
        result.data.map((doc) => ({
          id: doc.id,
          contactId: doc.contactId,
          contactName: doc.contact.razonSocial,
          label: `N° ${doc.folio ?? 's/n'}`,
          pending: doc.totalAmount - doc.paidAmount,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [direction]);

  const filteredDocs = useMemo(() => {
    const term = docQuery.trim().toLowerCase();
    return docs.filter((doc) => !term || doc.contactName.toLowerCase().includes(term) || doc.label.includes(term)).slice(0, 50);
  }, [docs, docQuery]);
  const selectedDoc = docs.find((doc) => doc.id === documentId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await createChequeAction({
        direction,
        number: form.number.trim(),
        bankCode: form.bankCode,
        drawerName: form.drawerName.trim() || undefined,
        drawerRut: form.drawerRut.trim() || undefined,
        contactId: selectedDoc?.contactId,
        amount: form.amount,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        documentId: documentId || undefined,
        bankAccountId: direction === 'ISSUED' ? form.bankAccountId : undefined,
        notes: form.notes.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cheque registrado');
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Registrar cheque</DialogTitle>
            <DialogDescription>Si el cheque paga un documento, elígelo: quedará abonado de inmediato.</DialogDescription>
          </DialogHeader>
          <div role="tablist" aria-label="Tipo de cheque" className="inline-flex rounded-md bg-muted p-0.5">
            {(['RECEIVED', 'ISSUED'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={direction === value}
                onClick={() => {
                  setDirection(value);
                  setDocumentId('');
                }}
                className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', direction === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {value === 'RECEIVED' ? 'Recibido de un cliente' : 'Girado a un proveedor'}
              </button>
            ))}
          </div>

          <div>
            <Label htmlFor="cheque-doc-search">{direction === 'RECEIVED' ? 'Documento que paga' : 'Factura que paga'}</Label>
            <Input id="cheque-doc-search" value={docQuery} placeholder="Buscar por nombre o folio" onChange={(e) => setDocQuery(e.target.value)} />
            <select
              aria-label="Documento"
              className={cn(nativeSelectClass, 'mt-2')}
              value={documentId}
              onChange={(e) => {
                setDocumentId(e.target.value);
                const doc = docs.find((item) => item.id === e.target.value);
                if (doc) setForm((prev) => ({ ...prev, amount: prev.amount || doc.pending, drawerName: prev.drawerName || doc.contactName }));
              }}
            >
              <option value="">Sin documento (cheque en garantía)</option>
              {filteredDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.contactName} · {doc.label} · saldo {formatCurrency(doc.pending)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="cheque-number">N° de cheque</Label>
              <Input id="cheque-number" inputMode="numeric" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="cheque-bank">Banco del cheque</Label>
              <select id="cheque-bank" className={nativeSelectClass} value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })}>
                {CHILEAN_BANKS.map((bank) => (
                  <option key={bank.code} value={bank.code}>{bank.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cheque-amount">Monto</Label>
              <CurrencyInput id="cheque-amount" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
              {selectedDoc && form.amount > selectedDoc.pending && <p className="mt-1 text-xs text-danger">Supera el saldo del documento</p>}
            </div>
            <div>
              <Label htmlFor="cheque-issue">Fecha de emisión</Label>
              <Input id="cheque-issue" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="cheque-due">Fecha de cobro</Label>
              <Input id="cheque-due" type="date" value={form.dueDate} min={form.issueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
            </div>
            {direction === 'ISSUED' ? (
              <div>
                <Label htmlFor="cheque-account">Girado de la cuenta</Label>
                <select id="cheque-account" className={nativeSelectClass} value={form.bankAccountId} onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })} required>
                  {bankAccounts.length === 0 && <option value="">Crea una cuenta en Bancos</option>}
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <Label htmlFor="cheque-drawer">Girador (titular)</Label>
                <Input id="cheque-drawer" value={form.drawerName} onChange={(e) => setForm({ ...form, drawerName: e.target.value })} />
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="cheque-notes">Nota (opcional)</Label>
            <Input id="cheque-notes" value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || form.amount <= 0 || (!documentId && direction === 'ISSUED')}>{saving ? 'Guardando…' : 'Registrar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChequeActionDialog({ action, bankAccounts, onClose, onDone }: { action: NonNullable<Action>; bankAccounts: Props['bankAccounts']; onClose: () => void; onDone: () => void }) {
  const { kind, cheque } = action;
  const [bankAccountId, setBankAccountId] = useState((bankAccounts.find((account) => account.isDefault) ?? bankAccounts[0])?.id ?? '');
  const [date, setDate] = useState(todayIso);
  const [reason, setReason] = useState(kind === 'bounce' ? 'Falta de fondos' : '');
  const [saving, setSaving] = useState(false);

  const titles = { deposit: 'Depositar cheque', clear: 'Marcar como cobrado', bounce: 'Protestar cheque', void: 'Anular cheque' };
  const descriptions = {
    deposit: 'El cobro pasa a la cuenta donde lo depositas, para conciliarlo con la cartola.',
    clear: 'El banco ya hizo efectivo el cheque.',
    bounce: 'El cobro se reversa (con su asiento) y el documento vuelve a quedar por cobrar.',
    void: cheque.paymentId ? 'El pago registrado con este cheque se reversa y el documento vuelve a quedar con saldo.' : 'El cheque queda anulado.',
  };

  async function handleConfirm() {
    setSaving(true);
    try {
      const result =
        kind === 'deposit'
          ? await depositChequeAction(cheque.id, bankAccountId, date)
          : kind === 'clear'
            ? await clearChequeAction(cheque.id, date)
            : kind === 'bounce'
              ? await bounceChequeAction(cheque.id, reason)
              : await voidChequeAction(cheque.id, reason);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Listo');
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titles[kind]}</DialogTitle>
          <DialogDescription>{descriptions[kind]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
            Cheque N° {cheque.number} · {bankName(cheque.bankCode)} · <span className="font-semibold tabular-nums">{formatCurrency(cheque.amount)}</span>
          </div>
          {kind === 'deposit' && (
            <div>
              <Label htmlFor="deposit-account">Cuenta de depósito</Label>
              <select id="deposit-account" className={nativeSelectClass} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                {bankAccounts.length === 0 && <option value="">Crea una cuenta en Bancos</option>}
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>
          )}
          {(kind === 'deposit' || kind === 'clear') && (
            <div>
              <Label htmlFor="cheque-action-date">Fecha</Label>
              <Input id="cheque-action-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          {(kind === 'bounce' || kind === 'void') && (
            <div>
              <Label htmlFor="cheque-reason">Motivo</Label>
              <Input id="cheque-reason" value={reason} maxLength={200} placeholder={kind === 'bounce' ? 'Ej. Falta de fondos, firma disconforme' : 'Ej. Girado por error'} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" variant={kind === 'bounce' || kind === 'void' ? 'destructive' : 'default'} disabled={saving || ((kind === 'bounce' || kind === 'void') && reason.trim().length < 3) || (kind === 'deposit' && !bankAccountId)} onClick={handleConfirm}>
            {saving ? 'Guardando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

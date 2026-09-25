'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Search } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { createPaymentBatchAction } from '@/modules/treasury/actions/payment-batches.actions';
import type { PayableOption } from '@/modules/treasury/services/payment-batches.service';

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' }) : 'sin vencimiento';
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

interface Props {
  payables: PayableOption[];
  bankAccounts: { id: string; name: string; isDefault: boolean }[];
}

export default function PaymentBatchForm({ payables, bankAccounts }: Props) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = useState((bankAccounts.find((account) => account.isDefault) ?? bankAccounts[0])?.id ?? '');
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [dueUntil, setDueUntil] = useState('');
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return payables.filter((doc) => {
      if (term && !doc.contactName.toLowerCase().includes(term) && !doc.label.toLowerCase().includes(term) && !doc.contactRut.includes(term)) return false;
      if (dueUntil && doc.dueDate && new Date(doc.dueDate).toISOString().slice(0, 10) > dueUntil) return false;
      return true;
    });
  }, [payables, query, dueUntil]);

  const total = [...selected.values()].reduce((sum, amount) => sum + amount, 0);
  const selectedDocs = payables.filter((doc) => selected.has(doc.id));
  const missingBank = new Set(selectedDocs.filter((doc) => !doc.hasBankData).map((doc) => doc.contactName));

  function toggle(doc: PayableOption) {
    if (doc.blocked) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.set(doc.id, doc.pending);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const doc of visible) if (!doc.blocked && !next.has(doc.id)) next.set(doc.id, doc.pending);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await createPaymentBatchAction({
        bankAccountId,
        paymentDate,
        notes: notes.trim() || undefined,
        items: [...selected.entries()].map(([purchaseDocumentId, amount]) => ({ purchaseDocumentId, amount })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Nómina creada');
      router.push(`/dashboard/treasury/payment-batches/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  if (bankAccounts.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card shadow-card">
        <EmptyState
          title="Primero registra una cuenta bancaria"
          description="La nómina sale desde una de tus cuentas."
          action={
            <Link href="/dashboard/treasury/banks" className={buttonVariants({ size: 'sm' })}>
              Ir a Bancos
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <section className="min-w-0 rounded-lg border border-border bg-card shadow-card" aria-label="Facturas por pagar">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Proveedor, RUT o folio" aria-label="Buscar factura" className="h-9 pl-8" />
          </div>
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="due-until" className="text-xs">Vencen hasta</Label>
              <Input id="due-until" type="date" className="h-9" value={dueUntil} onChange={(e) => setDueUntil(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={selectAllVisible} disabled={visible.length === 0}>
              Marcar visibles
            </Button>
          </div>
        </div>
        {payables.length === 0 ? (
          <EmptyState title="No hay facturas de proveedor por pagar" description="Todas las compras registradas están pagadas o ya están en una nómina abierta." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-10 px-4 py-2.5" />
                  <th className="px-4 py-2.5 font-medium">Proveedor</th>
                  <th className="px-4 py-2.5 font-medium">Documento</th>
                  <th className="px-4 py-2.5 font-medium">Vence</th>
                  <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
                  <th className="px-4 py-2.5 text-right font-medium">A pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((doc) => {
                  const amount = selected.get(doc.id);
                  return (
                    <tr key={doc.id} className={cn(amount !== undefined && 'bg-accent/30', doc.blocked && 'opacity-60')}>
                      <td className="px-4 py-2">
                        <input type="checkbox" className="size-4 accent-primary" checked={amount !== undefined} disabled={doc.blocked} onChange={() => toggle(doc)} aria-label={`Pagar ${doc.label} de ${doc.contactName}`} />
                      </td>
                      <td className="max-w-[240px] px-4 py-2">
                        <p className="truncate font-medium">{doc.contactName}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.contactRut}
                          {!doc.hasBankData && <span className="ml-1 text-warning">· sin datos bancarios</span>}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {doc.label}
                        {doc.blocked && <p className="text-xs text-danger">Bloqueada: difiere de su OC</p>}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{formatDate(doc.dueDate)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(doc.pending)}</td>
                      <td className="px-4 py-2 text-right">
                        {amount !== undefined ? (
                          <CurrencyInput
                            className="ml-auto h-8 w-32"
                            value={amount}
                            aria-label={`Monto a pagar de ${doc.label}`}
                            onChange={(value) =>
                              setSelected((prev) => {
                                const next = new Map(prev);
                                next.set(doc.id, Math.min(value, doc.pending));
                                return next;
                              })
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="h-fit space-y-4 rounded-lg border border-border bg-card p-4 shadow-card xl:sticky xl:top-20">
        <div>
          <Label htmlFor="batch-account">Pagar desde</Label>
          <select id="batch-account" className={nativeSelectClass} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="batch-date">Fecha de pago</Label>
          <Input id="batch-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="batch-notes">Nota (opcional)</Label>
          <Input id="batch-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <dl className="space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Facturas</dt>
            <dd className="tabular-nums">{selected.size}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCurrency(total)}</dd>
          </div>
        </dl>
        {missingBank.size > 0 && (
          <p className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Sin datos bancarios: {[...missingBank].join(', ')}. Complétalos en su ficha antes de subir el archivo al banco.
          </p>
        )}
        <Button type="button" className="w-full" disabled={saving || selected.size === 0 || !bankAccountId} onClick={handleSave}>
          {saving ? 'Creando…' : 'Crear nómina'}
        </Button>
      </aside>
    </div>
  );
}

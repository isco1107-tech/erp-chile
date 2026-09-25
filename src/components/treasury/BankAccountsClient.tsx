'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, Landmark, Pencil, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { BANK_ACCOUNT_TYPES, BANK_ACCOUNT_TYPE_LABELS, CHILEAN_BANKS, bankName, type BankAccountType } from '@/lib/treasury/banks';
import { cn } from '@/lib/utils';
import { saveBankAccountAction } from '@/modules/treasury/actions/banks.actions';
import type { BankAccountRow } from '@/modules/treasury/services/banks.service';

interface FormState {
  name: string;
  bankCode: string;
  accountType: string;
  accountNumber: string;
  openingBalance: number;
  openingDate: string;
  isDefault: boolean;
  isActive: boolean;
}

const EMPTY: FormState = { name: '', bankCode: '012', accountType: 'CUENTA_CORRIENTE', accountNumber: '', openingBalance: 0, openingDate: '', isDefault: false, isActive: true };

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }) : 'sin cartolas';
}

export default function BankAccountsClient({ accounts, canWrite }: { accounts: BankAccountRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  function openForm(account?: BankAccountRow) {
    setEditing(account?.id ?? null);
    setForm(
      account
        ? {
            name: account.name,
            bankCode: account.bankCode,
            accountType: account.accountType,
            accountNumber: account.accountNumber,
            openingBalance: account.openingBalance,
            openingDate: account.openingDate ? new Date(account.openingDate).toISOString().slice(0, 10) : '',
            isDefault: account.isDefault,
            isActive: account.isActive,
          }
        : EMPTY
    );
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await saveBankAccountAction(editing, form);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cuenta guardada');
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && accounts.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => openForm()}>
            <Plus className="size-4" aria-hidden="true" /> Agregar cuenta
          </Button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            icon={<Landmark className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title="Registra tu primera cuenta bancaria"
            description="Con la cuenta creada podrás importar la cartola del banco, conciliar cobros y pagos, depositar cheques y armar nóminas de pago."
            actionLabel={canWrite ? 'Agregar cuenta' : undefined}
            onAction={canWrite ? () => openForm() : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const difference = account.bankBalance - account.bookBalance;
            return (
              <article key={account.id} className={cn('flex flex-col rounded-lg border border-border bg-card p-5 shadow-card', !account.isActive && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{bankName(account.bankCode)}</p>
                    <h2 className="truncate text-base font-semibold">{account.name}</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      {BANK_ACCOUNT_TYPE_LABELS[account.accountType as BankAccountType] ?? account.accountType} · {account.accountNumber}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {account.isDefault && <StatusBadge tone="accent">Principal</StatusBadge>}
                    {!account.isActive && <StatusBadge tone="neutral">Inactiva</StatusBadge>}
                    {canWrite && (
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${account.name}`} onClick={() => openForm(account)}>
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Según banco</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatCurrency(account.bankBalance)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Según registros</dt>
                    <dd className="text-lg font-semibold tabular-nums">{formatCurrency(account.bookBalance)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {account.unmatchedLines > 0 ? (
                    <StatusBadge tone="warning">{account.unmatchedLines} por conciliar</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Al día</StatusBadge>
                  )}
                  {difference !== 0 && (
                    <span className="tabular-nums">
                      Diferencia {difference < 0 ? '−' : '+'}
                      {formatCurrency(Math.abs(difference))}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Última cartola: {formatDate(account.lastStatementDate)}</p>
                <Link href={`/dashboard/treasury/banks/${account.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4 w-full')}>
                  Conciliar <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria'}</DialogTitle>
              <DialogDescription>El saldo inicial es el que mostraba el banco el día desde el que empiezas a conciliar.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="ba-name">Nombre</Label>
                <Input id="ba-name" value={form.name} placeholder="Ej. Cuenta corriente principal" onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="ba-bank">Banco</Label>
                <select id="ba-bank" className={nativeSelectClass} value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })}>
                  {CHILEAN_BANKS.map((bank) => (
                    <option key={bank.code} value={bank.code}>{bank.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="ba-type">Tipo de cuenta</Label>
                <select id="ba-type" className={nativeSelectClass} value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}>
                  {BANK_ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>{BANK_ACCOUNT_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="ba-number">N° de cuenta</Label>
                <Input id="ba-number" inputMode="numeric" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="ba-opening">Saldo inicial</Label>
                <CurrencyInput id="ba-opening" value={form.openingBalance} onChange={(value) => setForm({ ...form, openingBalance: value })} />
              </div>
              <div>
                <Label htmlFor="ba-date">Conciliar desde</Label>
                <Input id="ba-date" type="date" value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                Cuenta principal
              </label>
              {editing && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  Activa
                </label>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

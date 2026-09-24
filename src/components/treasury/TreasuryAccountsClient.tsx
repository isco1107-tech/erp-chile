'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Banknote, Landmark, Pencil, Plus, Power, Vault } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/switch';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import {
  getTreasuryAccountsBoardAction,
  saveTreasuryAccountAction,
  setTreasuryAccountActiveAction,
  type TreasuryAccountsBoard,
} from '@/modules/treasury/actions/accounts.actions';
import { TREASURY_ACCOUNT_TYPE_LABELS } from '@/modules/treasury/schema';

type AccountRow = TreasuryAccountsBoard['accounts'][number];

interface FormState {
  name: string;
  type: 'CASH' | 'BANK';
  bankName: string;
  accountNumber: string;
  ledgerAccountId: string;
  openingBalance: number;
  openingDate: string;
  isDefault: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'BANK',
  bankName: '',
  accountNumber: '',
  ledgerAccountId: '',
  openingBalance: 0,
  openingDate: '',
  isDefault: false,
};

/** Bancos de uso frecuente en Chile, como sugerencia (el campo acepta cualquier texto). */
const CHILEAN_BANKS = ['BancoEstado', 'Banco de Chile', 'Santander', 'BCI', 'Scotiabank', 'Itaú', 'Banco Security', 'Banco BICE', 'Banco Falabella', 'Banco Ripley', 'Banco Consorcio', 'Banco Internacional', 'Coopeuch', 'Mercado Pago', 'Tenpo'];

export default function TreasuryAccountsClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const [board, setBoard] = useState<TreasuryAccountsBoard | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await getTreasuryAccountsBoardAction();
    if (result.success) setBoard(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew(type: 'CASH' | 'BANK') {
    setEditing({ id: null, form: { ...EMPTY_FORM, type, name: type === 'CASH' ? 'Caja principal' : '' } });
  }

  function openEdit(account: AccountRow) {
    setEditing({
      id: account.id,
      form: {
        name: account.name,
        type: account.type,
        bankName: account.bankName ?? '',
        accountNumber: account.accountNumber ?? '',
        ledgerAccountId: account.ledgerAccountId ?? '',
        openingBalance: account.openingBalance,
        openingDate: account.openingDate ? new Date(account.openingDate).toISOString().slice(0, 10) : '',
        isDefault: account.isDefault,
      },
    });
  }

  function patch(values: Partial<FormState>) {
    setEditing((current) => (current ? { ...current, form: { ...current.form, ...values } } : current));
  }

  async function save() {
    if (!editing) return;
    const { form } = editing;
    setSaving(true);
    try {
      const result = await saveTreasuryAccountAction(editing.id, {
        name: form.name,
        type: form.type,
        bankName: form.bankName || undefined,
        accountNumber: form.accountNumber || undefined,
        ledgerAccountId: form.ledgerAccountId || undefined,
        openingBalance: form.openingBalance,
        openingDate: form.openingDate || undefined,
        isDefault: form.isDefault,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Guardado');
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(account: AccountRow) {
    if (account.isActive) {
      const ok = await confirm({
        title: `¿Desactivar "${account.name}"?`,
        description: 'Deja de aparecer al registrar pagos. Sus movimientos históricos se conservan.',
        confirmLabel: 'Desactivar',
      });
      if (!ok) return;
    }
    const result = await setTreasuryAccountActiveAction(account.id, !account.isActive);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Listo');
    await load();
  }

  if (!board) return <p className="text-sm text-muted-foreground">Cargando cuentas…</p>;

  const active = board.accounts.filter((a) => a.isActive);
  const totalBanks = active.filter((a) => a.type === 'BANK').reduce((sum, a) => sum + a.balance, 0);
  const totalCash = active.filter((a) => a.type === 'CASH').reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Disponible total" value={formatCurrency(totalBanks + totalCash)} icon={Vault} tone="accent" />
        <KpiCard label="En bancos" value={formatCurrency(totalBanks)} icon={Landmark} tone="info" />
        <KpiCard label="En caja" value={formatCurrency(totalCash)} icon={Banknote} tone="success" />
      </section>

      {canWrite && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => openNew('CASH')}>
            <Plus aria-hidden="true" />
            Nueva caja
          </Button>
          <Button type="button" onClick={() => openNew('BANK')}>
            <Plus aria-hidden="true" />
            Nueva cuenta bancaria
          </Button>
        </div>
      )}

      {board.accounts.length === 0 ? (
        <EmptyState
          title="Todavía no registras tus cajas ni bancos"
          description="Crea tu cuenta corriente y tu caja: cada cobro y pago del sistema (ventas, sueldos, honorarios, cuotas…) quedará asignado a una de ellas y verás su saldo al día."
          action={
            canWrite ? (
              <Button type="button" onClick={() => openNew('BANK')}>
                Crear primera cuenta
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Cuenta contable</th>
                <th className="px-3 py-2 text-right">Movimientos</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                {canWrite && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {board.accounts.map((account) => (
                <tr key={account.id} className={`border-t border-border ${account.isActive ? '' : 'opacity-60'}`}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{account.name}</span>
                    {account.isDefault && <StatusBadge tone="accent" className="ml-2">Por defecto</StatusBadge>}
                    {!account.isActive && <StatusBadge tone="neutral" className="ml-2">Inactiva</StatusBadge>}
                    {account.type === 'BANK' && (account.bankName || account.accountNumber) && (
                      <span className="block text-xs text-muted-foreground">
                        {[account.bankName, account.accountNumber].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{TREASURY_ACCOUNT_TYPE_LABELS[account.type]}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {account.ledgerAccount ? `${account.ledgerAccount.code} ${account.ledgerAccount.name}` : account.type === 'CASH' ? 'Caja (general)' : 'Banco (general)'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{account.movementCount}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${account.balance < 0 ? 'text-danger' : ''}`}>{formatCurrency(account.balance)}</td>
                  {canWrite && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(account)} aria-label={`Editar ${account.name}`}>
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void toggleActive(account)} aria-label={account.isActive ? `Desactivar ${account.name}` : `Reactivar ${account.name}`}>
                          <Power aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        El saldo es el saldo inicial más los ingresos y menos los egresos registrados en cada cuenta. Los pagos sin cuenta asignada no suman a ninguna: asígnales una
        por defecto para que el saldo refleje todo.
      </p>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.id ? 'Editar cuenta' : editing.form.type === 'CASH' ? 'Nueva caja' : 'Nueva cuenta bancaria'}</DialogTitle>
                <DialogDescription>Los cobros y pagos del sistema se asignan a la cuenta por defecto de su tipo, salvo que elijas otra al registrarlos.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ta-type">Tipo</Label>
                    <select id="ta-type" className={nativeSelectClass} value={editing.form.type} onChange={(e) => patch({ type: e.target.value as 'CASH' | 'BANK' })}>
                      <option value="BANK">Cuenta bancaria</option>
                      <option value="CASH">Caja (efectivo)</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="ta-name">Nombre</Label>
                    <Input id="ta-name" value={editing.form.name} maxLength={80} onChange={(e) => patch({ name: e.target.value })} placeholder={editing.form.type === 'CASH' ? 'Caja principal' : 'BancoEstado cta. cte.'} />
                  </div>
                </div>
                {editing.form.type === 'BANK' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="ta-bank">Banco</Label>
                      <Input id="ta-bank" list="ta-bank-list" value={editing.form.bankName} maxLength={80} onChange={(e) => patch({ bankName: e.target.value })} />
                      <datalist id="ta-bank-list">
                        {CHILEAN_BANKS.map((bank) => (
                          <option key={bank} value={bank} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <Label htmlFor="ta-number">N° de cuenta</Label>
                      <Input id="ta-number" value={editing.form.accountNumber} maxLength={40} onChange={(e) => patch({ accountNumber: e.target.value })} />
                    </div>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ta-opening">Saldo inicial</Label>
                    <CurrencyInput id="ta-opening" value={editing.form.openingBalance} onChange={(value) => patch({ openingBalance: value })} />
                  </div>
                  <div>
                    <Label htmlFor="ta-opening-date">Desde</Label>
                    <Input id="ta-opening-date" type="date" value={editing.form.openingDate} onChange={(e) => patch({ openingDate: e.target.value })} />
                  </div>
                </div>
                {board.ledgerAccounts.length > 0 && (
                  <div>
                    <Label htmlFor="ta-ledger">Cuenta contable (opcional)</Label>
                    <select id="ta-ledger" className={nativeSelectClass} value={editing.form.ledgerAccountId} onChange={(e) => patch({ ledgerAccountId: e.target.value })}>
                      <option value="">{editing.form.type === 'CASH' ? 'Usar la cuenta general de Caja' : 'Usar la cuenta general de Banco'}</option>
                      {board.ledgerAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} — {account.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">Útil si llevas una subcuenta contable por banco (ej. 1102-01 BancoEstado).</p>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={editing.form.isDefault}
                    onCheckedChange={(checked) => patch({ isDefault: checked })}
                    label="Usar esta cuenta por defecto"
                  />
                  <span>Usar por defecto para {editing.form.type === 'CASH' ? 'pagos en efectivo' : 'transferencias, tarjetas y cheques'}</span>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="button" disabled={saving} onClick={() => void save()}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

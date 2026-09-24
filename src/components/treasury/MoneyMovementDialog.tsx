'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { PAYMENT_METHOD_TYPES, PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';

export type MoneyMethod = (typeof PAYMENT_METHOD_TYPES)[number];

export interface TreasuryAccountChoice {
  id: string;
  name: string;
  type: 'CASH' | 'BANK';
  isDefault: boolean;
}

export interface MoneyMovementSubmit {
  amount: number;
  paymentMethod: MoneyMethod;
  treasuryAccountId?: string;
  paymentDate?: string;
  referenceNumber?: string;
}

type SubmitResult = { success: true; message?: string } | { success: false; error: string };

interface MoneyMovementDialogProps {
  /** Texto del botón que abre el diálogo. */
  triggerLabel: string;
  title: string;
  description?: ReactNode;
  direction: 'INCOME' | 'EXPENSE';
  /** Monto sugerido (y máximo, si `maxAmount` no se indica). */
  amount: number;
  /** Si es `true` el monto no se edita (p. ej. el líquido exacto de una boleta). */
  fixedAmount?: boolean;
  maxAmount?: number;
  accounts: TreasuryAccountChoice[];
  defaultMethod?: MoneyMethod;
  onSubmit: (values: MoneyMovementSubmit) => Promise<SubmitResult>;
  onDone?: () => void;
  triggerVariant?: 'default' | 'outline';
  size?: 'sm' | 'default';
  disabled?: boolean;
}

/**
 * Diálogo único para registrar dinero que entra o sale desde cualquier módulo
 * (pagar una boleta de honorarios, reembolsar una rendición, pagar sueldos,
 * cobrar una cuota…). Pregunta lo mismo en todos lados: cuánto, con qué medio,
 * desde/hacia qué caja o banco, cuándo y con qué comprobante. Así cada pago
 * del sistema llega a Tesorería con la misma información.
 */
export default function MoneyMovementDialog({
  triggerLabel,
  title,
  description,
  direction,
  amount,
  fixedAmount = false,
  maxAmount,
  accounts,
  defaultMethod = 'TRANSFERENCIA',
  onSubmit,
  onDone,
  triggerVariant = 'default',
  size = 'default',
  disabled = false,
}: MoneyMovementDialogProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(amount);
  const [method, setMethod] = useState<MoneyMethod>(defaultMethod);
  const [accountId, setAccountId] = useState<string>(() => pickDefaultAccount(accounts, defaultMethod));
  const [date, setDate] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  const limit = maxAmount ?? amount;
  const verb = direction === 'INCOME' ? 'cobrar' : 'pagar';

  function reset() {
    setValue(amount);
    setMethod(defaultMethod);
    setAccountId(pickDefaultAccount(accounts, defaultMethod));
    setDate('');
    setReference('');
  }

  function changeMethod(next: MoneyMethod) {
    setMethod(next);
    // Al cambiar a efectivo se propone la caja por defecto, y viceversa.
    setAccountId(pickDefaultAccount(accounts, next));
  }

  async function submit() {
    const finalAmount = fixedAmount ? amount : value;
    if (finalAmount <= 0) {
      toast.error('Ingresa un monto mayor a cero');
      return;
    }
    if (finalAmount > limit) {
      toast.error(`El monto no puede superar ${formatCurrency(limit)}`);
      return;
    }
    setSaving(true);
    try {
      const result = await onSubmit({
        amount: finalAmount,
        paymentMethod: method,
        treasuryAccountId: accountId || undefined,
        paymentDate: date || undefined,
        referenceNumber: reference.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Movimiento registrado en Tesorería');
      setOpen(false);
      reset();
      onDone?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" size={size} variant={triggerVariant} disabled={disabled} onClick={() => setOpen(true)}>
        {triggerLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="space-y-3">
            {fixedAmount ? (
              <div className="flex justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>Monto a {verb}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(amount)}</span>
              </div>
            ) : (
              <div>
                <Label htmlFor="money-amount">Monto a {verb}</Label>
                <CurrencyInput id="money-amount" value={value} onChange={setValue} />
                <p className="mt-1 text-xs text-muted-foreground">Máximo {formatCurrency(limit)}</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="money-method">Medio de pago</Label>
                <select
                  id="money-method"
                  className={nativeSelectClass}
                  value={method}
                  onChange={(event) => changeMethod(event.target.value as MoneyMethod)}
                >
                  {PAYMENT_METHOD_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {PAYMENT_METHOD_TYPE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="money-account">{direction === 'INCOME' ? 'Entra a' : 'Sale de'}</Label>
                <select
                  id="money-account"
                  className={nativeSelectClass}
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                >
                  <option value="">Sin especificar</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="money-date">Fecha</Label>
                <Input id="money-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Vacío = hoy</p>
              </div>
              <div>
                <Label htmlFor="money-reference">N° de comprobante</Label>
                <Input
                  id="money-reference"
                  value={reference}
                  maxLength={120}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>

            {accounts.length === 0 && (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Tip: crea tus cajas y cuentas bancarias en Tesorería → Cuentas para ver el saldo de cada una.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={submit}>
              {saving ? 'Guardando…' : `Registrar ${direction === 'INCOME' ? 'cobro' : 'pago'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Caja/banco que se propone según el medio de pago: efectivo → caja por defecto; lo demás → banco por defecto. */
export function pickDefaultAccount(accounts: TreasuryAccountChoice[], method: MoneyMethod): string {
  const type = method === 'EFECTIVO' ? 'CASH' : 'BANK';
  return accounts.find((account) => account.type === type && account.isDefault)?.id ?? accounts.find((account) => account.type === type)?.id ?? '';
}

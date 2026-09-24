'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listTreasuryAccountOptionsAction } from '@/modules/treasury/actions/accounts.actions';
import { pickDefaultAccount, type TreasuryAccountChoice } from './MoneyMovementDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerPurchasePaymentAction, registerSalesPaymentAction } from '@/modules/treasury/actions/treasury.actions';
import { PAYMENT_METHOD_TYPES, PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import { formatCurrency } from '@/lib/chile/tax';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30';

interface RegisterPaymentDialogProps {
  kind: 'sales' | 'purchase';
  documentId: string;
  totalAmount: number;
  paidAmount: number;
  contactLabel: string;
  triggerLabel?: string;
  size?: 'sm' | 'default';
  onRegistered?: () => void;
}

export default function RegisterPaymentDialog({
  kind,
  documentId,
  totalAmount,
  paidAmount,
  contactLabel,
  triggerLabel,
  size = 'sm',
  onRegistered,
}: RegisterPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHOD_TYPES)[number]>('EFECTIVO');
  const [paymentDate, setPaymentDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [accounts, setAccounts] = useState<TreasuryAccountChoice[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Las cajas/bancos se cargan al abrir: así la cuenta por defecto del medio
  // de pago queda preseleccionada y el saldo de cada cuenta cuadra.
  useEffect(() => {
    if (!open) return;
    listTreasuryAccountOptionsAction('treasury').then((result) => {
      if (!result.success) return;
      setAccounts(result.data);
      setTreasuryAccountId((current) => current || pickDefaultAccount(result.data, paymentMethod));
    });
    // Solo al abrir; el cambio de medio de pago ajusta la cuenta en su propio handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pendingBalance = totalAmount - paidAmount;
  const parsedAmount = Math.round(Number(amount)) || 0;

  function resetForm() {
    setAmount('');
    setPaymentMethod('EFECTIVO');
    setPaymentDate('');
    setReferenceNumber('');
    setTreasuryAccountId('');
    setNotes('');
  }

  async function handleSubmit() {
    if (parsedAmount <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }
    if (parsedAmount > pendingBalance) {
      toast.error('El monto no puede superar el saldo pendiente');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        amount: parsedAmount,
        paymentMethod,
        paymentDate: paymentDate || undefined,
        referenceNumber: referenceNumber || undefined,
        treasuryAccountId: treasuryAccountId || undefined,
        notes: notes || undefined,
      };
      const result =
        kind === 'sales'
          ? await registerSalesPaymentAction(documentId, payload)
          : await registerPurchasePaymentAction(documentId, payload);

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Movimiento registrado');
      resetForm();
      setOpen(false);
      onRegistered?.();
    } finally {
      setSaving(false);
    }
  }

  if (pendingBalance <= 0) {
    return <span className="text-xs text-muted-foreground">Pagado en su totalidad</span>;
  }

  return (
    <>
      <Button type="button" size={size} onClick={() => setOpen(true)}>
        {triggerLabel ?? (kind === 'sales' ? 'Registrar Abono / Pago' : 'Registrar Pago a Proveedor')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{kind === 'sales' ? 'Registrar Abono / Cobro' : 'Registrar Pago a Proveedor'}</DialogTitle>
            <DialogDescription>{contactLabel}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span>Saldo pendiente</span>
              <span className="font-semibold">{formatCurrency(pendingBalance)}</span>
            </div>

            <div>
              <Label htmlFor="payment-amount">Monto a {kind === 'sales' ? 'cobrar' : 'pagar'}</Label>
              <Input
                id="payment-amount"
                type="number"
                min={0}
                max={pendingBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {parsedAmount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Saldo restante tras el movimiento: {formatCurrency(Math.max(pendingBalance - parsedAmount, 0))}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="payment-method">Medio de pago</Label>
              <select
                id="payment-method"
                className={selectClass}
                value={paymentMethod}
                onChange={(e) => {
                  const next = e.target.value as (typeof PAYMENT_METHOD_TYPES)[number];
                  setPaymentMethod(next);
                  setTreasuryAccountId(pickDefaultAccount(accounts, next));
                }}
              >
                {PAYMENT_METHOD_TYPES.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_METHOD_TYPE_LABELS[method]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="payment-date">Fecha</Label>
                <Input id="payment-date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="payment-reference">N° Comprobante</Label>
                <Input id="payment-reference" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
              </div>
            </div>

            <div>
              <Label htmlFor="payment-account">{kind === 'sales' ? 'Entra a' : 'Sale de'}</Label>
              <select id="payment-account" className={selectClass} value={treasuryAccountId} onChange={(e) => setTreasuryAccountId(e.target.value)}>
                <option value="">Sin especificar</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              {accounts.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Crea tus cajas y bancos en Tesorería → Cajas & Bancos para ver el saldo de cada una.</p>
              )}
            </div>

            <div>
              <Label htmlFor="payment-notes">Notas</Label>
              <Input id="payment-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={handleSubmit}>
              {saving ? 'Guardando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

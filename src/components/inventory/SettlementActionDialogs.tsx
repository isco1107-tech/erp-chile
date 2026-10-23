'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/chile/tax';
import { markSettlementPaidAction, voidSettlementAction } from '@/modules/inventory/actions/consignment.actions';
import { settlementPaySchema, settlementVoidSchema } from '@/modules/inventory/schema';

export interface SettlementRef {
  id: string;
  number: number;
  consignorName: string;
  payoutAmount: number;
}

interface DialogProps {
  settlement: SettlementRef;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}

/** Hoy en Santiago (YYYY-MM-DD): el navegador puede estar en otra zona horaria. */
function todayInChile(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

/** Registra que la liquidación ya se pagó al seller (el pago en sí se hace fuera: transferencia, efectivo…). */
export function PaySettlementDialog({ settlement, onClose, onDone }: DialogProps) {
  const [paidAt, setPaidAt] = useState(todayInChile);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = settlementPaySchema.safeParse({ id: settlement.id, paidAt, reference: reference.trim() || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    setSaving(true);
    try {
      const result = await markSettlementPaidAction(parsed.data);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Liquidación pagada');
      await onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marcar como pagada</DialogTitle>
          <DialogDescription>
            Liquidación N° {settlement.number} · {settlement.consignorName} · {formatCurrency(settlement.payoutAmount)}. Esto solo deja constancia: el pago al seller lo haces tú (transferencia, efectivo…).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="settlement-paid-at">Fecha de pago</Label>
            <Input id="settlement-paid-at" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="settlement-reference">Referencia (opcional)</Label>
            <Input id="settlement-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ej: N° de transferencia" className="mt-1.5" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Marcar como pagada'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Anula una liquidación que aún no se pagó: sus ventas vuelven a quedar pendientes. */
export function VoidSettlementDialog({ settlement, onClose, onDone }: DialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const parsed = settlementVoidSchema.safeParse({ id: settlement.id, reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos');
      return;
    }
    setSaving(true);
    try {
      const result = await voidSettlementAction(parsed.data);
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Liquidación anulada');
      await onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular liquidación N° {settlement.number}</DialogTitle>
          <DialogDescription>
            Sus ventas vuelven a quedar pendientes y podrás liquidarlas de nuevo. Una liquidación ya pagada no se puede anular.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="settlement-void-reason">Motivo</Label>
            <Input id="settlement-void-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5" autoFocus />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? 'Anulando…' : 'Anular liquidación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

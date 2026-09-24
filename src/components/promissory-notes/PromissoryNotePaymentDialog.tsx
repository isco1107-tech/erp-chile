'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import PaymentChannelFields, { DEFAULT_PAYMENT_CHANNEL } from '@/components/treasury/PaymentChannelFields';
import { registerPromissoryNotePaymentAction } from '@/modules/promissory-notes/actions/promissory-notes.actions';

interface Props {
  noteId: string;
  amount: number;
  paidAmount: number;
}

/**
 * Registra el monto pagado del pagaré; el `paymentStatus`/`status` los
 * recalcula siempre el servidor — ver `registerPromissoryNotePayment`. La
 * diferencia con lo ya pagado entra a Tesorería por el medio y la cuenta elegidos.
 */
export default function PromissoryNotePaymentDialog({ noteId, amount, paidAmount }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(paidAmount);
  const [channel, setChannel] = useState(DEFAULT_PAYMENT_CHANNEL);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await registerPromissoryNotePaymentAction(noteId, {
        paidAmount: value,
        paymentMethod: channel.paymentMethod,
        treasuryAccountId: channel.treasuryAccountId || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Pago actualizado');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="paidAmount">Monto pagado acumulado</Label>
          <CurrencyInput id="paidAmount" value={value} onChange={setValue} className="w-48" />
        </div>
        <Button type="button" size="sm" disabled={saving || value > amount || value === paidAmount} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Guardar pago'}
        </Button>
      </div>
      {value > amount && <p className="text-xs text-destructive">El pago no puede superar el monto del pagaré</p>}
      {value !== paidAmount && value <= amount && (
        <>
          <PaymentChannelFields context="promissory" value={channel} onChange={setChannel} idPrefix="pn" />
          <p className="text-xs text-muted-foreground">
            {value > paidAmount ? 'La diferencia entra a Tesorería como cobro.' : 'La diferencia se registra en Tesorería como devolución o corrección.'}
          </p>
        </>
      )}
    </div>
  );
}

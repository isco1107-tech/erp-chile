'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import PaymentChannelFields, { DEFAULT_PAYMENT_CHANNEL } from '@/components/treasury/PaymentChannelFields';
import { updateSponsorshipPaymentAction } from '@/modules/sponsorships/actions/sponsorships.actions';

interface Props {
  contractId: string;
  cashAmount: number;
  paidAmount: number;
}

/**
 * Registra el monto pagado de la porción en efectivo del contrato; el
 * `paymentStatus` lo recalcula siempre el servidor. La diferencia con lo ya
 * pagado entra a Tesorería por el medio y la cuenta elegidos.
 */
export default function SponsorshipPaymentForm({ contractId, cashAmount, paidAmount }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(paidAmount);
  const [channel, setChannel] = useState(DEFAULT_PAYMENT_CHANNEL);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateSponsorshipPaymentAction(contractId, {
        paidAmount: amount,
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
          <CurrencyInput id="paidAmount" value={amount} onChange={setAmount} className="w-48" />
        </div>
        <Button type="button" size="sm" disabled={saving || amount > cashAmount || amount === paidAmount} onClick={handleSave}>
          {saving ? 'Guardando...' : 'Guardar pago'}
        </Button>
      </div>
      {amount > cashAmount && <p className="text-xs text-destructive">El pago no puede superar el aporte en efectivo pactado</p>}
      {amount !== paidAmount && amount <= cashAmount && <PaymentChannelFields context="sponsorship" value={channel} onChange={setChannel} idPrefix="sp" />}
    </div>
  );
}

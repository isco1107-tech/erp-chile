'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { updateSponsorshipPaymentAction } from '@/modules/sponsorships/actions/sponsorships.actions';

interface Props {
  contractId: string;
  cashAmount: number;
  paidAmount: number;
}

/** Registra el monto pagado de la porción en efectivo del contrato; el `paymentStatus` lo recalcula siempre el servidor. */
export default function SponsorshipPaymentForm({ contractId, cashAmount, paidAmount }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState(paidAmount);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updateSponsorshipPaymentAction(contractId, { paidAmount: amount });
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
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label htmlFor="paidAmount">Actualizar monto pagado</Label>
        <CurrencyInput id="paidAmount" value={amount} onChange={setAmount} className="w-48" />
      </div>
      <Button type="button" size="sm" disabled={saving || amount > cashAmount} onClick={handleSave}>
        {saving ? 'Guardando...' : 'Guardar pago'}
      </Button>
      {amount > cashAmount && <p className="text-xs text-destructive">El pago no puede superar el aporte en efectivo pactado</p>}
    </div>
  );
}

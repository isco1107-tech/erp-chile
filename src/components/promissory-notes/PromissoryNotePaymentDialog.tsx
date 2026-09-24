'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { registerPromissoryNotePaymentAction } from '@/modules/promissory-notes/actions/promissory-notes.actions';
import { PAYMENT_METHOD_TYPES, PAYMENT_METHOD_TYPE_LABELS } from '@/modules/promissory-notes/schema';

interface Props {
  noteId: string;
  amount: number;
  paidAmount: number;
}

/** Registra el monto pagado del pagaré; el `paymentStatus`/`status` los recalcula siempre el servidor — ver `registerPromissoryNotePayment`. */
export default function PromissoryNotePaymentDialog({ noteId, amount, paidAmount }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(paidAmount);
  const [method, setMethod] = useState<(typeof PAYMENT_METHOD_TYPES)[number]>('TRANSFERENCIA');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const result = await registerPromissoryNotePaymentAction(noteId, { paidAmount: value, method });
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
        <CurrencyInput id="paidAmount" value={value} onChange={setValue} className="w-48" />
      </div>
      <div>
        <Label htmlFor="paymentMethod">Forma de pago del abono</Label>
        <select
          id="paymentMethod"
          className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
          value={method}
          onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHOD_TYPES)[number])}
        >
          {PAYMENT_METHOD_TYPES.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_TYPE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" size="sm" disabled={saving || value > amount || value < paidAmount} onClick={handleSave}>
        {saving ? 'Guardando...' : 'Guardar pago'}
      </Button>
      {value > amount && <p className="text-xs text-destructive">El pago no puede superar el monto del pagaré</p>}
      {value < paidAmount && <p className="text-xs text-destructive">El pago no puede ser menor al ya registrado</p>}
    </div>
  );
}

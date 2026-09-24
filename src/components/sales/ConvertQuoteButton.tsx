'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileOutput } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { convertQuoteAction } from '@/modules/sales/actions/quotes.actions';
import { DTE_TYPE_LABELS, QUOTE_TARGET_DTE_TYPES as TARGETS } from '@/modules/sales/schema';

/** "Convertir en…": crea el borrador del documento elegido con las líneas de la cotización. */
export default function ConvertQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [target, setTarget] = useState<(typeof TARGETS)[number]>('FACTURA_33');
  const [busy, setBusy] = useState(false);

  async function convert() {
    setBusy(true);
    try {
      const result = await convertQuoteAction(quoteId, { target });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Borrador creado');
      router.push(`/dashboard/sales/${result.data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select aria-label="Convertir en" className={`${nativeSelectClass} w-auto`} value={target} onChange={(e) => setTarget(e.target.value as typeof target)}>
        {TARGETS.map((type) => (
          <option key={type} value={type}>
            {DTE_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      <Button type="button" disabled={busy} onClick={() => void convert()}>
        <FileOutput aria-hidden="true" /> {busy ? 'Convirtiendo…' : 'Convertir cotización'}
      </Button>
    </div>
  );
}

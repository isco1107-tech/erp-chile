'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { MUTUAL_OPTIONS } from '@/lib/chile/payroll-deductions';
import { cn } from '@/lib/utils';
import { updatePayrollSettingsAction } from '@/modules/hr/actions/employee-finance.actions';

/** Organismo del seguro de accidentes (Ley 16.744): da nombre a la línea "Mutual" del resumen de cotizaciones. */
export function MutualSetting({ initial, canWrite }: { initial: string; canWrite: boolean }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const result = await updatePayrollSettingsAction({ mutualCode: next });
      if (!result.success) {
        setValue(previous);
        toast.error(result.error);
      } else toast.success(result.message ?? 'Guardado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
      Seguro de accidentes:
      <select className={cn(nativeSelectClass, 'h-8 w-auto')} value={value} disabled={!canWrite || saving} onChange={(e) => void change(e.target.value)} aria-label="Organismo del seguro de accidentes">
        {MUTUAL_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

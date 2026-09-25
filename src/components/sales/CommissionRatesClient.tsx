'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { setCommissionRateAction } from '@/modules/sales/actions/commissions.actions';
import type { SellerOption } from '@/modules/sales/services/commissions.service';

const BASIS_LABEL = { ISSUED: 'Sobre lo facturado', COLLECTED: 'Sobre lo cobrado' } as const;

/** Tasa y base de comisión de cada vendedor, editable en línea. */
export default function CommissionRatesClient({ sellers }: { sellers: SellerOption[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(sellers.map((s) => [s.id, { percent: s.rateBps !== null ? String(s.rateBps / 100) : '', basis: s.basis ?? 'ISSUED' }]))
  );
  const [saving, setSaving] = useState<string | null>(null);

  async function save(userId: string) {
    const draft = drafts[userId];
    if (!draft) return;
    setSaving(userId);
    const result = await setCommissionRateAction({ userId, ratePercent: Number(draft.percent) || 0, basis: draft.basis });
    setSaving(null);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Comisión guardada');
    router.refresh();
  }

  return (
    <ul className="divide-y divide-border">
      {sellers.map((seller) => {
        const draft = drafts[seller.id] ?? { percent: '', basis: 'ISSUED' as const };
        const changed = draft.percent !== (seller.rateBps !== null ? String(seller.rateBps / 100) : '') || draft.basis !== (seller.basis ?? 'ISSUED');
        return (
          <li key={seller.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium">{seller.name}</p>
              <p className="truncate text-xs text-muted-foreground">{seller.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step="0.1"
                  className="h-8 w-24 pr-6"
                  value={draft.percent}
                  placeholder="0"
                  aria-label={`Comisión de ${seller.name} (%)`}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [seller.id]: { ...draft, percent: e.target.value } }))}
                />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              <Select
                items={BASIS_LABEL}
                value={draft.basis}
                onValueChange={(v) => setDrafts((prev) => ({ ...prev, [seller.id]: { ...draft, basis: v as 'ISSUED' | 'COLLECTED' } }))}
              >
                <SelectTrigger className="h-8 w-44" aria-label={`Base de comisión de ${seller.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ISSUED">{BASIS_LABEL.ISSUED}</SelectItem>
                  <SelectItem value="COLLECTED">{BASIS_LABEL.COLLECTED}</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant={changed ? 'default' : 'outline'} disabled={!changed || saving === seller.id} onClick={() => save(seller.id)}>
                {saving === seller.id ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

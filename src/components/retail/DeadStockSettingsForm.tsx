'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { DEAD_STOCK_DAY_OPTIONS, type DeadStockDays } from '@/lib/retail/dead-stock';
import { saveDeadStockSettingsAction } from '@/modules/retail/actions/retail-settings.actions';

/** Umbral de stock muerto y aviso al cumplirlo (solo quien tiene `retail:manage`). */
export function DeadStockSettingsForm({ deadStockDays, deadStockAlerts }: { deadStockDays: DeadStockDays; deadStockAlerts: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState<DeadStockDays>(deadStockDays);
  const [alerts, setAlerts] = useState(deadStockAlerts);
  const [pending, startTransition] = useTransition();
  const dirty = days !== deadStockDays || alerts !== deadStockAlerts;

  const save = () =>
    startTransition(async () => {
      const result = await saveDeadStockSettingsAction({ deadStockDays: days, deadStockAlerts: alerts });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Ajustes guardados');
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <label className="space-y-1 text-xs font-medium text-muted-foreground">
        Detenido desde
        <select
          value={days}
          onChange={(event) => setDays(Number(event.target.value) as DeadStockDays)}
          className="block h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
        >
          {DEAD_STOCK_DAY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} días sin rotar
            </option>
          ))}
        </select>
      </label>
      <div className="flex h-9 items-center gap-2 text-sm">
        <Switch checked={alerts} onCheckedChange={setAlerts} label="Avisar cuando un producto cumpla el umbral" />
        <span>Avisar al cumplirlo (campanita y automatizaciones)</span>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={!dirty || pending}
        className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Guardar ajustes'}
      </button>
    </div>
  );
}

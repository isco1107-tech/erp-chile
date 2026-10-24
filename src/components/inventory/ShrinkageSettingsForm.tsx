'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { EXPIRY_ALERT_DAY_OPTIONS, LIABLE_PARTIES, LIABLE_PARTY_LABELS, SHRINKAGE_REASON_KEYS, type LiableParty, type ShrinkageReasonKey } from '@/lib/inventory/shrinkage';
import { WASTE_REASON_LABELS } from '@/lib/warehouse-mobile/modes';
import { saveShrinkageSettingsAction } from '@/modules/inventory/actions/shrinkage.actions';

type Defaults = Partial<Record<ShrinkageReasonKey, LiableParty>>;

const reasonName = (key: ShrinkageReasonKey) => (key === 'NONE' ? 'Sin motivo (faltantes de conteo y ajustes)' : WASTE_REASON_LABELS[key]);

/**
 * Acuerdos de la empresa (`settings:company`): quién responde por defecto según
 * el motivo, y el aviso de lotes por vencer. "Sin definir" = sin sugerencia.
 */
export function ShrinkageSettingsForm({ defaults, expiryAlerts, expiryAlertDays }: { defaults: Defaults; expiryAlerts: boolean; expiryAlertDays: number }) {
  const router = useRouter();
  const [values, setValues] = useState<Defaults>(defaults);
  const [alerts, setAlerts] = useState(expiryAlerts);
  const [days, setDays] = useState(expiryAlertDays);
  const [pending, startTransition] = useTransition();
  const dirty =
    alerts !== expiryAlerts || days !== expiryAlertDays || SHRINKAGE_REASON_KEYS.some((key) => (values[key] ?? null) !== (defaults[key] ?? null));

  const setReason = (key: ShrinkageReasonKey, value: string) =>
    setValues((current) => {
      const next = { ...current };
      if (value === 'STORE' || value === 'SUPPLIER') next[key] = value;
      else delete next[key];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const result = await saveShrinkageSettingsAction({ defaults: values, expiryAlerts: alerts, expiryAlertDays: days });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Ajustes guardados');
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Quién responde según el motivo</h2>
        <p className="text-xs text-muted-foreground">
          Tus acuerdos con los productores. Sirve de sugerencia en cada pérdida; si responde el proveedor o seller, se sugiere el seller dueño de la mercadería en consignación, si no el proveedor de la llegada o, si el producto tiene uno solo, ese.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SHRINKAGE_REASON_KEYS.map((key) => (
          <label key={key} className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
            <span className="block break-words">{reasonName(key)}</span>
            <select value={values[key] ?? ''} onChange={(event) => setReason(key, event.target.value)} className="block h-9 w-full rounded-lg border border-border bg-card px-2 text-sm text-foreground">
              <option value="">Sin definir</option>
              {LIABLE_PARTIES.map((party) => (
                <option key={party} value={party}>
                  {LIABLE_PARTY_LABELS[party]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-border pt-4">
        <div className="flex min-h-9 items-center gap-2 text-sm">
          <Switch checked={alerts} onCheckedChange={setAlerts} label="Avisar de lotes por vencer" />
          <span>Avisar de lotes por vencer (campanita)</span>
        </div>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Avisar con
          <select
            value={days}
            disabled={!alerts}
            onChange={(event) => setDays(Number(event.target.value))}
            className="block h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground disabled:opacity-50"
          >
            {EXPIRY_ALERT_DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} días de anticipación
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || pending}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </div>
    </div>
  );
}

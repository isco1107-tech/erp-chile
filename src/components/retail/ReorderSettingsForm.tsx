'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { COVER_DAY_OPTIONS, LEAD_DAY_OPTIONS } from '@/lib/retail/reorder';
import { saveReorderSettingsAction } from '@/modules/retail/actions/retail-settings.actions';

const selectClass = 'block h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground';

/**
 * Tiempo de entrega por defecto, días a cubrir y tiempos por proveedor de la
 * reposición predictiva (solo quien tiene `retail:manage`). Un tiempo
 * configurado para un proveedor manda sobre el medido en sus órdenes.
 */
export function ReorderSettingsForm({
  leadDays,
  coverDays,
  supplierLeadDays,
  suppliers,
}: {
  leadDays: number;
  coverDays: number;
  supplierLeadDays: Record<string, number>;
  suppliers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [lead, setLead] = useState(leadDays);
  const [cover, setCover] = useState(coverDays);
  const [perSupplier, setPerSupplier] = useState<Record<string, number>>(supplierLeadDays);
  const [newSupplier, setNewSupplier] = useState('');
  const [newDays, setNewDays] = useState('7');
  const [pending, startTransition] = useTransition();
  const nameOf = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const available = suppliers.filter((supplier) => !(supplier.id in perSupplier));

  const add = () => {
    const days = Number(newDays);
    if (!newSupplier || !Number.isInteger(days) || days < 0 || days > 120) return void toast.error('Elige el proveedor y escribe los días (0 a 120)');
    setPerSupplier((current) => ({ ...current, [newSupplier]: days }));
    setNewSupplier('');
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveReorderSettingsAction({ reorderLeadDays: lead, reorderCoverDays: cover, supplierLeadDays: perSupplier });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Ajustes guardados');
      setPerSupplier(result.data.supplierLeadDays);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Entrega por defecto
          <select value={lead} onChange={(event) => setLead(Number(event.target.value))} className={selectClass}>
            {LEAD_DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} {option === 1 ? 'día' : 'días'}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Cada pedido cubre
          <select value={cover} onChange={(event) => setCover(Number(event.target.value))} className={selectClass}>
            {COVER_DAY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} días de venta
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Tiempo de entrega por proveedor (manda sobre el medido en sus órdenes de compra)</p>
        {Object.keys(perSupplier).length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {Object.entries(perSupplier).map(([id, days]) => (
              <li key={id} className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-1 pl-3 text-sm">
                <span className="break-words">{nameOf.get(id) ?? 'Proveedor'}</span>
                <span className="tabular-nums text-muted-foreground">{days} d</span>
                <button
                  type="button"
                  onClick={() => setPerSupplier(({ [id]: _removed, ...rest }) => rest)}
                  aria-label={`Quitar el tiempo de entrega de ${nameOf.get(id) ?? 'este proveedor'}`}
                  className="inline-flex size-6 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {available.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 basis-48 space-y-1 text-xs font-medium text-muted-foreground">
              Proveedor
              <select value={newSupplier} onChange={(event) => setNewSupplier(event.target.value)} className={`${selectClass} w-full`}>
                <option value="">Elige un proveedor</option>
                {available.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              Días
              <input type="number" min={0} max={120} value={newDays} onChange={(event) => setNewDays(event.target.value)} className={`${selectClass} w-20`} />
            </label>
            <button type="button" onClick={add} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
              Agregar
            </button>
          </div>
        )}
      </div>

      <button type="button" onClick={save} disabled={pending} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        {pending ? 'Guardando…' : 'Guardar ajustes'}
      </button>
    </div>
  );
}

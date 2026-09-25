'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Ship } from 'lucide-react';
import type { ImportShipmentStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { createImportShipmentAction } from '@/modules/purchases/actions/import-shipment.actions';
import { IMPORT_STATUS_LABELS } from '@/modules/purchases/schema';
import type { ImportShipmentRow } from '@/modules/purchases/services/import-shipment.service';
import { ImportHeaderDialog, type ImportHeaderValues } from './ImportHeaderDialog';

export const IMPORT_STATUS_TONE: Record<ImportShipmentStatus, Tone> = { OPEN: 'info', CLOSED: 'success', CANCELLED: 'neutral' };

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

interface Props {
  rows: ImportShipmentRow[];
  canWrite: boolean;
  suppliers: { id: string; label: string }[];
  warehouses: { id: string; name: string }[];
}

export default function ImportShipmentsClient({ rows, canWrite, suppliers, warehouses }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function create(values: ImportHeaderValues): Promise<boolean> {
    const result = await createImportShipmentAction(values);
    if (!result.success) {
      toast.error(result.error);
      return false;
    }
    toast.success(result.message ?? 'Carpeta creada');
    router.push(`/dashboard/purchases/imports/${result.data.id}`);
    return true;
  }

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Carpetas de importación">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <p className="text-sm text-muted-foreground">{rows.length} carpeta{rows.length === 1 ? '' : 's'}</p>
        {canWrite && (
          <Button type="button" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" /> Nueva carpeta
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Ship className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title="Aún no hay importaciones"
          description="Abre una carpeta por embarque: productos con su precio FOB, tipo de cambio y todos los costos hasta la bodega. Al cerrarla, la mercadería entra al inventario a su costo real."
          actionLabel={canWrite ? 'Nueva carpeta' : undefined}
          onAction={canWrite ? () => setCreating(true) : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">N°</th>
                <th className="px-4 py-2.5 font-medium">Embarque</th>
                <th className="px-4 py-2.5 font-medium">Llegada</th>
                <th className="px-4 py-2.5 text-right font-medium">FOB en pesos</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo puesto en bodega</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.folio}</td>
                  <td className="max-w-[300px] px-4 py-2.5">
                    <Link href={`/dashboard/purchases/imports/${row.id}`} className="font-medium hover:underline">{row.reference}</Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.supplierName ?? 'Sin proveedor'} · {row.itemCount} producto{row.itemCount === 1 ? '' : 's'} · {row.currency} a {row.exchangeRate.toLocaleString('es-CL')}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(row.arrivalDate)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.fobTotal)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className="font-medium">{formatCurrency(row.landedTotal)}</span>
                    {row.upliftPercent > 0 && <span className="block text-xs text-muted-foreground">+{row.upliftPercent.toLocaleString('es-CL')}% sobre FOB</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={IMPORT_STATUS_TONE[row.status]}>{IMPORT_STATUS_LABELS[row.status]}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <ImportHeaderDialog title="Nueva carpeta de importación" suppliers={suppliers} warehouses={warehouses} onClose={() => setCreating(false)} onSubmit={create} />}
    </section>
  );
}

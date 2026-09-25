'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardCheck, Plus } from 'lucide-react';
import type { InventoryCountStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass } from '@/components/ui/field-classes';
import type { Tone } from '@/components/ui/tone';
import { createInventoryCountAction } from '@/modules/inventory/actions/inventory-count.actions';
import type { InventoryCountListItem } from '@/modules/inventory/services/inventory-count.service';

export const COUNT_STATUS_LABELS: Record<InventoryCountStatus, string> = {
  OPEN: 'En conteo',
  POSTED: 'Contabilizado',
  CANCELLED: 'Anulado',
};

export const COUNT_STATUS_TONE: Record<InventoryCountStatus, Tone> = {
  OPEN: 'warning',
  POSTED: 'success',
  CANCELLED: 'neutral',
};

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

interface Props {
  counts: InventoryCountListItem[];
  warehouses: { id: string; name: string; isDefault: boolean }[];
  categories: { id: string; name: string }[];
  canWrite: boolean;
}

export default function InventoryCountsClient({ counts, warehouses, categories, canWrite }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warehouseId, setWarehouseId] = useState(() => (warehouses.find((w) => w.isDefault) ?? warehouses[0])?.id ?? '');
  const [categoryId, setCategoryId] = useState('all');
  const [notes, setNotes] = useState('');

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await createInventoryCountAction({ warehouseId, categoryId: categoryId === 'all' ? undefined : categoryId, notes: notes.trim() || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Conteo abierto');
      router.push(`/dashboard/inventory/counts/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && !creating && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setCreating(true)} disabled={warehouses.length === 0}>
            <Plus className="size-4" aria-hidden="true" /> Nueva toma de inventario
          </Button>
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card">
          <div>
            <h2 className="text-base font-semibold">Abrir una toma de inventario</h2>
            <p className="text-sm text-muted-foreground">
              Se toma una foto del stock de la bodega. Mientras cuentas puedes seguir vendiendo: al contabilizar, el ajuste se calcula contra el stock de ese momento.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="count-warehouse">Bodega</Label>
              <select id="count-warehouse" className={nativeSelectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="count-category">Productos a contar</Label>
              <select id="count-category" className={nativeSelectClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="all">Todos los que llevan stock</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>Solo categoría: {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="count-notes">Nota (opcional)</Label>
              <Input id="count-notes" value={notes} maxLength={500} placeholder="Ej. Cierre de año, pasillo 3" onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !warehouseId}>{saving ? 'Abriendo…' : 'Abrir conteo'}</Button>
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Tomas de inventario">
        {counts.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title="Aún no hay tomas de inventario"
            description="Contar periódicamente lo que hay en bodega detecta mermas, robos y errores de registro antes de que lleguen al balance."
            actionLabel={canWrite && warehouses.length > 0 ? 'Abrir la primera' : undefined}
            onAction={canWrite && warehouses.length > 0 ? () => setCreating(true) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">N°</th>
                  <th className="px-4 py-2.5 font-medium">Bodega</th>
                  <th className="px-4 py-2.5 font-medium">Alcance</th>
                  <th className="px-4 py-2.5 font-medium">Abierto</th>
                  <th className="px-4 py-2.5 font-medium">Avance</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {counts.map((count) => {
                  const pct = count.lines === 0 ? 0 : Math.round((count.counted / count.lines) * 100);
                  return (
                    <tr key={count.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/inventory/counts/${count.id}`} className="font-mono text-xs font-medium hover:underline">
                          #{count.folio}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/inventory/counts/${count.id}`} className="font-medium hover:underline">
                          {count.warehouseName}
                        </Link>
                        {count.notes && <p className="max-w-[260px] truncate text-xs text-muted-foreground">{count.notes}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{count.categoryName ?? 'Todos los productos'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(count.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-muted" aria-hidden="true">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {count.counted}/{count.lines}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={COUNT_STATUS_TONE[count.status]}>{COUNT_STATUS_LABELS[count.status]}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

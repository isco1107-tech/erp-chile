'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Factory, Plus } from 'lucide-react';
import type { ProductionOrderStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { createProductionOrderAction, listProductionOrdersAction } from '@/modules/manufacturing/actions/manufacturing.actions';
import { PRODUCTION_STATUS_LABELS } from '@/modules/manufacturing/schema';
import type { ProductionOrderRow } from '@/modules/manufacturing/services/manufacturing.service';

export const PRODUCTION_STATUS_TONE: Record<ProductionOrderStatus, Tone> = { PLANNED: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', CANCELLED: 'neutral' };

const FILTERS = [
  { value: 'OPEN', label: 'Abiertas' },
  { value: 'COMPLETED', label: 'Terminadas' },
  { value: 'ALL', label: 'Todas' },
];

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

function qty(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 4 });
}

interface Props {
  canWrite: boolean;
  boms: { id: string; name: string; productName: string; unit: string; outputQuantity: number }[];
  warehouses: { id: string; name: string }[];
}

export default function ProductionOrdersClient({ canWrite, boms, warehouses }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState('OPEN');
  const [rows, setRows] = useState<ProductionOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listProductionOrdersAction(filter).then((result) => {
      if (cancelled) return;
      if (result.success) setRows(result.data);
      else toast.error(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Órdenes de producción">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Estado" className="inline-flex rounded-md bg-muted p-0.5">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', filter === item.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/manufacturing/boms" className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted">
            Recetas
          </Link>
          {canWrite && (
            <Button type="button" disabled={boms.length === 0} onClick={() => setCreating(true)} title={boms.length === 0 ? 'Crea primero una receta' : undefined}>
              <Plus className="size-4" aria-hidden="true" /> Nueva orden
            </Button>
          )}
        </div>
      </div>
      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={<Factory className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title={boms.length === 0 ? 'Empieza por una receta' : 'No hay órdenes en esta vista'}
          description={
            boms.length === 0
              ? 'Define qué insumos lleva cada producto que fabricas. Después, cada orden de producción descuenta esos insumos y deja el producto terminado a su costo real.'
              : 'Planifica una orden: verás si alcanzan los insumos en la bodega antes de fabricar.'
          }
          actionLabel={boms.length === 0 ? 'Ir a recetas' : canWrite ? 'Nueva orden' : undefined}
          onAction={boms.length === 0 ? () => router.push('/dashboard/manufacturing/boms') : canWrite ? () => setCreating(true) : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">N°</th>
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                <th className="px-4 py-2.5 font-medium">Bodega</th>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 text-right font-medium">Costo unitario</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.folio}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/dashboard/manufacturing/${row.id}`} className="font-medium hover:underline">{row.productName}</Link>
                    <p className="text-xs text-muted-foreground">{row.bomName ?? 'Receta eliminada'}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{qty(row.quantity)} {row.unit}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.warehouseName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.completedAt ? formatDate(row.completedAt) : formatDate(row.plannedDate)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.unitCost !== null ? formatCurrency(Math.round(row.unitCost)) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={PRODUCTION_STATUS_TONE[row.status]}>{PRODUCTION_STATUS_LABELS[row.status]}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewOrderDialog boms={boms} warehouses={warehouses} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/dashboard/manufacturing/${id}`)} />}
    </section>
  );
}

function NewOrderDialog({ boms, warehouses, onClose, onCreated }: { boms: Props['boms']; warehouses: Props['warehouses']; onClose: () => void; onCreated: (id: string) => void }) {
  const [bomId, setBomId] = useState(boms[0]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [plannedDate, setPlannedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const bom = boms.find((candidate) => candidate.id === bomId);

  async function save() {
    setSaving(true);
    try {
      const normalized = quantity.includes(',') ? quantity.replace(/\./g, '').replace(',', '.') : quantity;
      const result = await createProductionOrderAction({ bomId, quantity: Number(normalized) || 0, warehouseId, plannedDate, notes: notes.trim() || undefined });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Orden creada');
      onCreated(result.data.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva orden de producción</DialogTitle>
          <DialogDescription>Los insumos se calculan desde la receta; al terminar la orden podrás informar el consumo real.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="po-bom">Receta</Label>
            <select id="po-bom" className={nativeSelectClass} value={bomId} onChange={(e) => setBomId(e.target.value)}>
              {boms.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.productName}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="po-qty">Cantidad a producir ({bom?.unit ?? 'UN'})</Label>
              <Input id="po-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={bom ? `Múltiplo de ${bom.outputQuantity}` : ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-date">Fecha planificada</Label>
              <Input id="po-date" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-warehouse">Bodega (de donde salen los insumos y a la que entra el producto)</Label>
            <select id="po-warehouse" className={nativeSelectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-notes">Notas</Label>
            <textarea id="po-notes" className={textareaClass} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || !bomId || !quantity || !warehouseId} onClick={save}>{saving ? 'Creando…' : 'Crear orden'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

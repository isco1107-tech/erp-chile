'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Coins, Factory, Package, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { KpiCard } from '@/components/ui/KpiCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { finishedCost } from '@/lib/manufacturing/production';
import { cn } from '@/lib/utils';
import { cancelProductionOrderAction, completeProductionOrderAction, startProductionOrderAction } from '@/modules/manufacturing/actions/manufacturing.actions';
import { PRODUCTION_STATUS_LABELS } from '@/modules/manufacturing/schema';
import type { ProductionOrderDetail } from '@/modules/manufacturing/services/manufacturing.service';
import { PRODUCTION_STATUS_TONE } from './ProductionOrdersClient';

function qty(value: number): string {
  return value.toLocaleString('es-CL', { maximumFractionDigits: 4 });
}

function money2(value: number): string {
  return `$${value.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
}

function parseDecimal(value: string): number {
  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export default function ProductionOrderClient({ order, canWrite, showCosts }: { order: ProductionOrderDetail; canWrite: boolean; showCosts: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const open = order.status === 'PLANNED' || order.status === 'IN_PROGRESS';
  const shortageIds = new Set(order.shortages.map((shortage) => shortage.productId));

  async function run(action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>) {
    setBusy(true);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.message) toast.success(result.message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/dashboard/manufacturing" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Órdenes de producción
      </Link>
      <PageHeader
        eyebrow={`Orden de producción N° ${order.folio}${order.bomName ? ` · ${order.bomName}` : ''}`}
        title={`${qty(order.quantity)} ${order.unit} de ${order.productName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={PRODUCTION_STATUS_TONE[order.status]}>{PRODUCTION_STATUS_LABELS[order.status]}</StatusBadge>
            <span>
              {order.warehouseName}
              {order.plannedDate && open ? ` · planificada para el ${formatDate(order.plannedDate)}` : ''}
              {order.completedAt ? ` · terminada el ${formatDate(order.completedAt)}` : ''}
            </span>
          </span>
        }
        actions={
          canWrite && open ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (await confirm({ title: '¿Anular la orden?', description: 'No mueve inventario.', confirmLabel: 'Anular' })) await run(() => cancelProductionOrderAction(order.id));
                }}
              >
                Anular
              </Button>
              {order.status === 'PLANNED' && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => run(() => startProductionOrderAction(order.id))}>
                  <Play className="size-4" aria-hidden="true" /> Iniciar
                </Button>
              )}
              <Button type="button" disabled={busy} onClick={() => setCompleting(true)}>
                <CheckCircle2 className="size-4" aria-hidden="true" /> Terminar producción
              </Button>
            </div>
          ) : undefined
        }
      />

      {open && order.shortages.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Faltan insumos en {order.warehouseName}:{' '}
            {order.shortages.map((shortage) => `${order.components.find((component) => component.productId === shortage.productId)?.name ?? 'insumo'} (faltan ${qty(shortage.missing)})`).join(', ')}. Compra o traslada antes de terminar la orden.
          </p>
        </div>
      )}

      {showCosts && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label={order.status === 'COMPLETED' ? 'Insumos consumidos' : 'Insumos (estimado)'} value={formatCurrency(order.status === 'COMPLETED' ? (order.totalCost ?? 0) - order.additionalCost : order.estimate.materials)} icon={Package} tone="info" hint={order.status === 'COMPLETED' ? 'Al PMP de cada insumo' : 'Con el PMP actual'} />
          <KpiCard label="Costos de fabricación" value={formatCurrency(order.additionalCost)} icon={Coins} tone="accent" hint={order.additionalCostNote ?? 'Mano de obra y otros'} />
          <KpiCard
            label="Costo unitario"
            value={money2(order.status === 'COMPLETED' ? (order.unitCost ?? 0) : order.estimate.unitCost)}
            icon={Factory}
            tone="success"
            hint={order.status === 'COMPLETED' ? `Total ${formatCurrency(order.totalCost ?? 0)}` : 'Estimado'}
          />
        </div>
      )}

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Insumos">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Insumos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Insumo</th>
                <th className="px-4 py-2 text-right font-medium">Planificado</th>
                {open ? <th className="px-4 py-2 text-right font-medium">Disponible en bodega</th> : <th className="px-4 py-2 text-right font-medium">Consumido</th>}
                {showCosts && <th className="px-4 py-2 text-right font-medium">{open ? 'Costo estimado' : 'Costo'}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.components.map((component) => (
                <tr key={component.id} className={cn(shortageIds.has(component.productId) && 'bg-warning-soft/50')}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{component.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{component.sku}</p>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{qty(component.plannedQuantity)} {component.unit}</td>
                  {open ? (
                    <td className={cn('px-4 py-2 text-right tabular-nums', shortageIds.has(component.productId) && 'font-semibold text-warning')}>{qty(component.available)} {component.unit}</td>
                  ) : (
                    <td className="px-4 py-2 text-right tabular-nums">{component.consumedQuantity !== null ? `${qty(component.consumedQuantity)} ${component.unit}` : '—'}</td>
                  )}
                  {showCosts && (
                    <td className="px-4 py-2 text-right tabular-nums">{open ? formatCurrency(Math.round(component.plannedQuantity * component.pmp)) : component.totalCost !== null ? formatCurrency(component.totalCost) : '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {order.notes && <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{order.notes}</p>}

      {completing && <CompleteDialog order={order} showCosts={showCosts} onClose={() => setCompleting(false)} onDone={() => { setCompleting(false); router.refresh(); }} />}
    </div>
  );
}

function CompleteDialog({ order, showCosts, onClose, onDone }: { order: ProductionOrderDetail; showCosts: boolean; onClose: () => void; onDone: () => void }) {
  const [produced, setProduced] = useState(String(order.quantity).replace('.', ','));
  const [consumed, setConsumed] = useState<Record<string, string>>(() => Object.fromEntries(order.components.map((component) => [component.id, String(component.plannedQuantity).replace('.', ',')])));
  const [additionalCost, setAdditionalCost] = useState(order.additionalCost);
  const [note, setNote] = useState(order.additionalCostNote ?? '');
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const materials = Math.round(order.components.reduce((sum, component) => sum + parseDecimal(consumed[component.id] ?? '0') * component.pmp, 0));
    const quantity = parseDecimal(produced);
    return quantity > 0 ? finishedCost(materials, additionalCost, quantity) : null;
  }, [additionalCost, consumed, order.components, produced]);

  async function submit() {
    setSaving(true);
    try {
      const result = await completeProductionOrderAction(order.id, {
        producedQuantity: parseDecimal(produced),
        consumed: Object.fromEntries(Object.entries(consumed).map(([id, value]) => [id, parseDecimal(value)])),
        additionalCost,
        additionalCostNote: note.trim() || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Producción terminada');
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Terminar producción N° {order.folio}</DialogTitle>
          <DialogDescription>Informa lo que realmente se produjo y consumió. Los insumos salen de {order.warehouseName} y el producto entra a la misma bodega.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="done-qty">Cantidad producida ({order.unit})</Label>
            <Input id="done-qty" inputMode="decimal" value={produced} onChange={(e) => setProduced(e.target.value)} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Consumo real de insumos</p>
            {order.components.map((component) => (
              <div key={component.id} className="flex items-center gap-3 text-sm">
                <label htmlFor={`consumed-${component.id}`} className="min-w-0 flex-1 truncate">{component.name}</label>
                <Input id={`consumed-${component.id}`} inputMode="decimal" className="w-28" value={consumed[component.id] ?? ''} onChange={(e) => setConsumed((current) => ({ ...current, [component.id]: e.target.value }))} />
                <span className="w-10 text-xs text-muted-foreground">{component.unit}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="done-extra">Mano de obra y otros costos</Label>
              <CurrencyInput id="done-extra" value={additionalCost} onChange={setAdditionalCost} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="done-note">Detalle</Label>
              <Input id="done-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Ej: 6 horas de cocina" />
            </div>
          </div>
          {showCosts && preview && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Costo estimado: <strong className="tabular-nums">{formatCurrency(preview.total)}</strong> · <strong className="tabular-nums">{money2(preview.unitCost)}</strong> por {order.unit}
              <span className="block text-xs text-muted-foreground">El costo final usa el PMP de cada insumo al momento de consumirlo.</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving} onClick={submit}>{saving ? 'Registrando…' : 'Terminar e ingresar a bodega'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

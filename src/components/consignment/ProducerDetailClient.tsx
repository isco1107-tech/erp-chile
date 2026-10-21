'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { assignProductToProducerAction, updateProducerAction } from '@/modules/consignment/actions/consignment.actions';
import type { ConsignmentProductRow } from '@/modules/consignment/services/settlement.service';
import { COMMISSION_BASE_LABEL, formatBps, percentToBps } from './format';

interface Props {
  producer: {
    id: string;
    defaultCommissionBps: number;
    commissionBase: 'NET' | 'GROSS';
    isActive: boolean;
    notes: string | null;
    paymentNotes: string | null;
  };
  assigned: ConsignmentProductRow[];
  available: ConsignmentProductRow[];
  canWrite: boolean;
}

export default function ProducerDetailClient({ producer, assigned, available, canWrite }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(String(producer.defaultCommissionBps / 100));
  const [base, setBase] = useState(producer.commissionBase);
  const [notes, setNotes] = useState(producer.notes ?? '');
  const [paymentNotes, setPaymentNotes] = useState(producer.paymentNotes ?? '');
  const [productId, setProductId] = useState('');
  const [override, setOverride] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const bps = percentToBps(percent);
    if (bps === null) {
      toast.error('Escribe la comisión como un porcentaje, por ejemplo 20 o 12,5');
      return;
    }
    setBusy(true);
    const result = await updateProducerAction(producer.id, { defaultCommissionBps: bps, commissionBase: base, notes, paymentNotes });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Guardado');
    router.refresh();
  }

  async function toggleActive() {
    const next = !producer.isActive;
    if (!next && !(await confirm({ title: '¿Desactivar al productor?', description: 'No se le podrán asignar productos nuevos. Lo ya vendido sigue liquidándose.' }))) return;
    setBusy(true);
    const result = await updateProducerAction(producer.id, { isActive: next });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Guardado');
    router.refresh();
  }

  async function assign(event: React.FormEvent) {
    event.preventDefault();
    let commissionBpsOverride: number | null = null;
    if (override.trim() !== '') {
      commissionBpsOverride = percentToBps(override);
      if (commissionBpsOverride === null) return void toast.error('La comisión propia debe ser un porcentaje válido');
    }
    setBusy(true);
    const result = await assignProductToProducerAction({ productId, producerId: producer.id, commissionBpsOverride });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Producto asignado');
    setProductId('');
    setOverride('');
    router.refresh();
  }

  async function release(product: ConsignmentProductRow) {
    if (!(await confirm({ title: `¿Devolver "${product.name}" a stock propio?`, description: 'Solo es posible si el producto no tiene stock ni costo promedio.' }))) return;
    setBusy(true);
    const result = await assignProductToProducerAction({ productId: product.id, producerId: null });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Producto devuelto');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pd-commission">Comisión por defecto (%)</Label>
          <Input id="pd-commission" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} disabled={!canWrite} />
          <p className="text-xs text-muted-foreground">Actual: {formatBps(producer.defaultCommissionBps)}. Cambiarla no altera lo ya vendido.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-base">Base de la comisión</Label>
          <select id="pd-base" className={nativeSelectClass} value={base} onChange={(e) => setBase(e.target.value as 'NET' | 'GROSS')} disabled={!canWrite}>
            <option value="NET">{COMMISSION_BASE_LABEL.NET}</option>
            <option value="GROSS">{COMMISSION_BASE_LABEL.GROSS}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pd-payment">Referencia de pago (sin datos sensibles)</Label>
          <Input id="pd-payment" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} maxLength={300} disabled={!canWrite} />
        </div>
        <div className="space-y-1.5 md:col-span-3">
          <Label htmlFor="pd-notes">Notas</Label>
          <textarea id="pd-notes" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} disabled={!canWrite} />
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <Button type="submit" disabled={busy}>
              Guardar cambios
            </Button>
            <Button type="button" variant="outline" onClick={toggleActive} disabled={busy}>
              {producer.isActive ? 'Desactivar productor' : 'Reactivar productor'}
            </Button>
          </div>
        )}
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Productos en consignación</h2>
        {canWrite && producer.isActive && (
          <form onSubmit={assign} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="assign-product">Producto de stock propio</Label>
              <select id="assign-product" className={nativeSelectClass} value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">Selecciona un producto…</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-override">Comisión propia (%) — opcional</Label>
              <Input id="assign-override" inputMode="decimal" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Usar la del productor" />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busy || !productId}>
                Asignar
              </Button>
            </div>
          </form>
        )}

        {assigned.length === 0 ? (
          <EmptyState icon={<Package className="size-5" aria-hidden="true" />} title="Sin productos asignados" description="Asigna los productos que este productor deja en consignación." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Comisión</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {assigned.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.sku}</td>
                    <td className="px-4 py-2.5">{p.commissionBpsOverride !== null ? `${formatBps(p.commissionBpsOverride)} (propia)` : `${formatBps(producer.defaultCommissionBps)} (del productor)`}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canWrite && (
                        <Button variant="ghost" size="sm" onClick={() => release(p)} disabled={busy}>
                          Devolver a stock propio
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { assignProductToProducerAction, getProductConsignmentAction } from '@/modules/consignment/actions/consignment.actions';
import type { ProductConsignmentState } from '@/modules/consignment/services/settlement.service';

/**
 * Abastecimiento del producto: propio o en consignación de un productor. Solo
 * se envía el productor y la comisión propia: el modo (OWN/CONSIGNMENT) lo
 * decide el servidor según haya o no productor, nunca el cliente. Si la
 * empresa no tiene el módulo (o el usuario no el permiso), el panel no aparece.
 */
export default function ProductConsignmentPanel({ productId }: { productId: string }) {
  const [state, setState] = useState<ProductConsignmentState | null>(null);
  const [producerId, setProducerId] = useState('');
  const [override, setOverride] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getProductConsignmentAction(productId).then((result) => {
      if (!alive || !result.success) return;
      setState(result.data);
      setProducerId(result.data.current.producerId ?? '');
      setOverride(result.data.current.commissionBpsOverride !== null ? String(result.data.current.commissionBpsOverride / 100) : '');
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  if (!state) return null;

  async function save() {
    let commissionBpsOverride: number | null = null;
    if (producerId && override.trim() !== '') {
      const value = Number(override.trim().replace(',', '.'));
      if (!Number.isFinite(value)) return void toast.error('La comisión propia debe ser un porcentaje válido');
      commissionBpsOverride = Math.round(value * 100);
    }
    setSaving(true);
    const result = await assignProductToProducerAction({ productId, producerId: producerId || null, commissionBpsOverride });
    setSaving(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Guardado');
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Handshake className="size-4" aria-hidden="true" /> Abastecimiento
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pc-producer">Productor</Label>
          <select id="pc-producer" className={nativeSelectClass} value={producerId} onChange={(e) => setProducerId(e.target.value)}>
            <option value="">Stock propio</option>
            {state.producers.map((p) => (
              <option key={p.id} value={p.id}>
                En consignación — {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pc-override">Comisión propia (%)</Label>
          <Input id="pc-override" inputMode="decimal" value={override} onChange={(e) => setOverride(e.target.value)} disabled={!producerId} placeholder="La del productor" />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" onClick={save} disabled={saving}>
            Guardar abastecimiento
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Solo se puede cambiar entre propio y consignación si el producto no tiene stock ni costo promedio.</p>
    </div>
  );
}

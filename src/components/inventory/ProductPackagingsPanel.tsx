'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Package, Plus, Trash2 } from 'lucide-react';
import type { ProductPackaging } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createPackagingAction, deletePackagingAction, listPackagingsAction } from '@/modules/inventory/actions/products.actions';

/**
 * Empaques del producto ("Caja x12"): con su propio código de barras, al
 * escanearlo en Ventas o en el POS se agregan todas las unidades de una vez.
 */
export default function ProductPackagingsPanel({ productId, unit }: { productId: string; unit: string }) {
  const [items, setItems] = useState<ProductPackaging[]>([]);
  const [name, setName] = useState('');
  const [factor, setFactor] = useState('');
  const [barcode, setBarcode] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listPackagingsAction(productId).then((r) => r.success && setItems(r.data));
  }, [productId]);

  async function add() {
    setSaving(true);
    const result = await createPackagingAction(productId, { name, factor: Number(factor), barcode: barcode.trim() || undefined });
    setSaving(false);
    if (!result.success) return void toast.error(result.error);
    setItems((prev) => [...prev, result.data].sort((a, b) => a.factor - b.factor));
    setName('');
    setFactor('');
    setBarcode('');
    toast.success(result.message ?? 'Empaque agregado');
  }

  async function remove(id: string) {
    const result = await deletePackagingAction(id);
    if (!result.success) return void toast.error(result.error);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Package className="size-4 text-muted-foreground" aria-hidden="true" /> Empaques
        <span className="text-xs font-normal text-muted-foreground">Cajas, packs o bultos con su propio código de barras.</span>
      </p>
      {items.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground"> · {item.factor} {unit}</span>
                {item.barcode && <span className="ml-2 font-mono text-xs text-muted-foreground">{item.barcode}</span>}
              </span>
              <Button type="button" size="icon-xs" variant="ghost" aria-label={`Eliminar ${item.name}`} onClick={() => remove(item.id)}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7rem_1fr_auto]">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Caja x12)" aria-label="Nombre del empaque" className="h-8" />
        <Input type="number" min={0} step="any" value={factor} onChange={(e) => setFactor(e.target.value)} placeholder={`${unit} por empaque`} aria-label="Unidades por empaque" className="h-8" />
        <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Código de barras (opcional)" aria-label="Código de barras del empaque" className="h-8" autoComplete="off" />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={saving || name.trim().length < 2 || !(Number(factor) > 0)}>
          <Plus aria-hidden="true" /> Agregar
        </Button>
      </div>
    </div>
  );
}

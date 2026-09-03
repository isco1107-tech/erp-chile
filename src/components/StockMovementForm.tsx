'use client';

import { useState, type FormEvent } from 'react';
import type { Warehouse } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { MOVEMENT_TYPES, stockMovementSchema } from '@/modules/inventory/schema';
import { registerStockMovementAction } from '@/modules/inventory/actions/inventory.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';

const MOVEMENT_LABELS: Record<(typeof MOVEMENT_TYPES)[number], string> = {
  PURCHASE_IN: 'Entrada por Compra',
  ADJUSTMENT_IN: 'Entrada por Ajuste',
  SALE_OUT: 'Salida por Venta',
  ADJUSTMENT_OUT: 'Salida por Ajuste',
  TRANSFER: 'Transferencia entre Bodegas',
};

const EMPTY_FORM = {
  productId: '',
  warehouseId: '',
  type: 'PURCHASE_IN' as (typeof MOVEMENT_TYPES)[number],
  quantity: '',
  unitCost: '',
  targetWarehouseId: '',
  reference: '',
  notes: '',
};

type FormState = typeof EMPTY_FORM;

interface StockMovementFormProps {
  products: ProductWithStock[];
  warehouses: Warehouse[];
  onSaved: () => void;
  onCancel: () => void;
}

export default function StockMovementForm({ products, warehouses, onSaved, onCancel }: StockMovementFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isIn = form.type === 'PURCHASE_IN' || form.type === 'ADJUSTMENT_IN';
  const isTransfer = form.type === 'TRANSFER';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = {
      productId: form.productId,
      warehouseId: form.warehouseId,
      type: form.type,
      quantity: Number(form.quantity),
      unitCost: isIn ? Number(form.unitCost) : undefined,
      targetWarehouseId: isTransfer ? form.targetWarehouseId || undefined : undefined,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
    };

    const parsed = stockMovementSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const result = await registerStockMovementAction(parsed.data);
      if (!result.success) {
        toast.error(result.error);
        setErrors({ form: result.error });
        return;
      }
      toast.success(result.message ?? 'Movimiento registrado');
      setForm(EMPTY_FORM);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="mv-type">Tipo de movimiento</Label>
          <select
            id="mv-type"
            value={form.type}
            onChange={(e) => update('type', e.target.value as FormState['type'])}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>{MOVEMENT_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="mv-product">Producto</Label>
          <select
            id="mv-product"
            value={form.productId}
            onChange={(e) => update('productId', e.target.value)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            <option value="">Seleccione producto</option>
            {products.filter((p) => p.isTrackable).map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </select>
          {errors.productId && <p className="mt-1 text-sm text-destructive">{errors.productId}</p>}
        </div>

        <div>
          <Label htmlFor="mv-warehouse">{isTransfer ? 'Bodega de origen' : 'Bodega'}</Label>
          <select
            id="mv-warehouse"
            value={form.warehouseId}
            onChange={(e) => update('warehouseId', e.target.value)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            <option value="">Seleccione bodega</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          {errors.warehouseId && <p className="mt-1 text-sm text-destructive">{errors.warehouseId}</p>}
        </div>

        {isTransfer && (
          <div>
            <Label htmlFor="mv-target">Bodega de destino</Label>
            <select
              id="mv-target"
              value={form.targetWarehouseId}
              onChange={(e) => update('targetWarehouseId', e.target.value)}
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            >
              <option value="">Seleccione bodega destino</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {errors.targetWarehouseId && <p className="mt-1 text-sm text-destructive">{errors.targetWarehouseId}</p>}
          </div>
        )}

        <div>
          <Label htmlFor="mv-quantity">Cantidad</Label>
          <Input
            id="mv-quantity"
            type="number"
            min={0}
            step="any"
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
            aria-invalid={!!errors.quantity}
          />
          {errors.quantity && <p className="mt-1 text-sm text-destructive">{errors.quantity}</p>}
        </div>

        {isIn && (
          <div>
            <Label htmlFor="mv-cost">Costo unitario</Label>
            <CurrencyInput
              id="mv-cost"
              value={Number(form.unitCost) || 0}
              onChange={(value) => update('unitCost', String(value))}
              aria-invalid={!!errors.unitCost}
            />
            {errors.unitCost && <p className="mt-1 text-sm text-destructive">{errors.unitCost}</p>}
          </div>
        )}

        <div>
          <Label htmlFor="mv-reference">Referencia</Label>
          <Input
            id="mv-reference"
            placeholder="Ej. Factura #123, Ajuste inicial"
            value={form.reference}
            onChange={(e) => update('reference', e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="mv-notes">Notas</Label>
          <Input id="mv-notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </div>
      </div>

      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Registrar movimiento'}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

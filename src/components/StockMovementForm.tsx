'use client';

import { useState, type FormEvent } from 'react';
import type { Warehouse } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { MOVEMENT_TYPES, stockMovementSchema } from '@/modules/inventory/schema';
import { WASTE_REASONS, WASTE_REASON_HINTS, WASTE_REASON_LABELS, type WasteReason } from '@/lib/warehouse-mobile/modes';
import { registerStockMovementAction } from '@/modules/inventory/actions/inventory.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';

const MOVEMENT_LABELS: Record<(typeof MOVEMENT_TYPES)[number], string> = {
  ADJUSTMENT_IN: 'Entrada por ajuste (sobrante, stock inicial)',
  ADJUSTMENT_OUT: 'Salida por ajuste (merma, vencido, pérdida)',
  TRANSFER: 'Traslado entre bodegas',
  PURCHASE_IN: 'Entrada de mercadería comprada (sin factura)',
};

/** Qué hace cada movimiento, en una línea, para elegir bien. */
const MOVEMENT_HINTS: Record<(typeof MOVEMENT_TYPES)[number], string> = {
  ADJUSTMENT_IN: 'Para cargar el stock inicial o corregir un sobrante. Las ventas se registran en Ventas o en el Punto de Venta.',
  ADJUSTMENT_OUT: 'Para lo que salió sin venderse. Elige el motivo: queda anotado en los movimientos de bodega.',
  TRANSFER: 'Mueve unidades de una bodega a otra sin cambiar el total.',
  PURCHASE_IN:
    'Solo suma stock y actualiza el costo: NO registra la factura del proveedor ni la deuda. Si tienes la factura, regístrala en Compras.',
};

const EMPTY_FORM = {
  productId: '',
  warehouseId: '',
  type: 'ADJUSTMENT_IN' as (typeof MOVEMENT_TYPES)[number],
  reasonCode: '' as WasteReason | '',
  quantity: '',
  unitCost: '',
  targetWarehouseId: '',
  reference: '',
  notes: '',
  lotNumber: '',
  expiryDate: '',
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
  const selectedProduct = products.find((p) => p.id === form.productId);
  const capturesLot = isIn && !!selectedProduct?.tracksLots;

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
      lotNumber: capturesLot ? form.lotNumber || undefined : undefined,
      expiryDate: capturesLot ? form.expiryDate || undefined : undefined,
      reasonCode: form.type === 'ADJUSTMENT_OUT' ? form.reasonCode || undefined : undefined,
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
          <p className="mt-1 text-xs text-muted-foreground">{MOVEMENT_HINTS[form.type]}</p>
        </div>

        {form.type === 'ADJUSTMENT_OUT' && (
          <div>
            <Label htmlFor="mv-reason">Motivo de la salida</Label>
            <select
              id="mv-reason"
              value={form.reasonCode}
              onChange={(e) => update('reasonCode', e.target.value as FormState['reasonCode'])}
              aria-invalid={!!errors.reasonCode}
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            >
              <option value="">Elige el motivo</option>
              {WASTE_REASONS.map((reason) => (
                <option key={reason} value={reason}>{WASTE_REASON_LABELS[reason]}</option>
              ))}
            </select>
            {form.reasonCode && <p className="mt-1 text-xs text-muted-foreground">{WASTE_REASON_HINTS[form.reasonCode]}</p>}
            {errors.reasonCode && <p className="mt-1 text-sm text-destructive">{errors.reasonCode}</p>}
          </div>
        )}

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

        {capturesLot && (
          <>
            <div>
              <Label htmlFor="mv-lot">Lote</Label>
              <Input
                id="mv-lot"
                placeholder="Ej. L2409-A (vacío = sin lote)"
                value={form.lotNumber}
                onChange={(e) => update('lotNumber', e.target.value)}
                aria-invalid={!!errors.lotNumber}
              />
              {errors.lotNumber && <p className="mt-1 text-sm text-destructive">{errors.lotNumber}</p>}
            </div>
            <div>
              <Label htmlFor="mv-expiry">Vencimiento</Label>
              <Input
                id="mv-expiry"
                type="date"
                value={form.expiryDate}
                onChange={(e) => update('expiryDate', e.target.value)}
                aria-invalid={!!errors.expiryDate}
              />
              {errors.expiryDate && <p className="mt-1 text-sm text-destructive">{errors.expiryDate}</p>}
            </div>
          </>
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
          <Input id="mv-notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} aria-invalid={!!errors.notes} />
          {errors.notes && <p className="mt-1 text-sm text-destructive">{errors.notes}</p>}
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

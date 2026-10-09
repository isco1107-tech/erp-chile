'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Warehouse } from '@prisma/client';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldHint, FieldLabel } from '@/components/ui/FieldLabel';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { MOVEMENT_TYPES, stockMovementSchema } from '@/modules/inventory/schema';
import { registerStockMovementAction } from '@/modules/inventory/actions/inventory.actions';
import { getProductAction, listProductsAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';

const MOVEMENT_LABELS: Record<(typeof MOVEMENT_TYPES)[number], string> = {
  PURCHASE_IN: 'Entrada por compra (solo mueve stock)',
  ADJUSTMENT_IN: 'Stock inicial / ajuste positivo',
  SALE_OUT: 'Salida por venta (solo mueve stock)',
  ADJUSTMENT_OUT: 'Merma / ajuste negativo',
  TRANSFER: 'Transferencia entre bodegas',
};

const EMPTY_FORM = {
  productId: '',
  warehouseId: '',
  // Lo habitual al abrir este formulario es cargar stock inicial o corregir un
  // conteo; las compras y ventas reales se registran en sus propios módulos.
  type: 'ADJUSTMENT_IN' as (typeof MOVEMENT_TYPES)[number],
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
  /** Producto que parte seleccionado (ej. recién creado, desde "Cargar stock inicial"). */
  defaultProductId?: string;
}

export default function StockMovementForm({ products, warehouses, onSaved, onCancel, defaultProductId }: StockMovementFormProps) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, productId: defaultProductId ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // La lista que llega por props es la primera página del catálogo (máx. 300
  // por orden alfabético). Con catálogos grandes el producto buscado puede no
  // estar ahí: el buscador consulta al servidor, y el producto preseleccionado
  // ("Cargar stock inicial") se trae aparte si no vino en la lista.
  const [productQuery, setProductQuery] = useState('');
  const [searched, setSearched] = useState<ProductWithStock[] | null>(null);
  const [preselected, setPreselected] = useState<ProductWithStock | null>(null);

  useEffect(() => {
    const term = productQuery.trim();
    if (term.length < 2) {
      setSearched(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      listProductsAction(term).then((result) => {
        if (!cancelled && result.success) setSearched(result.data);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [productQuery]);

  useEffect(() => {
    if (!defaultProductId || products.some((p) => p.id === defaultProductId)) return;
    let cancelled = false;
    getProductAction(defaultProductId).then((result) => {
      if (!cancelled && result.success) setPreselected(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultProductId, products]);

  const baseOptions = searched ?? products;
  const productOptions = preselected && !baseOptions.some((p) => p.id === preselected.id) ? [preselected, ...baseOptions] : baseOptions;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isIn = form.type === 'PURCHASE_IN' || form.type === 'ADJUSTMENT_IN';
  const isTransfer = form.type === 'TRANSFER';
  const selectedProduct = productOptions.find((p) => p.id === form.productId) ?? products.find((p) => p.id === form.productId);
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
          {(form.type === 'PURCHASE_IN' || form.type === 'SALE_OUT') && (
            <FieldHint>
              Esto solo mueve el stock: no crea documento ni IVA. Las compras y ventas reales se registran en{' '}
              <Link href="/dashboard/purchases/new" className="font-medium text-primary underline underline-offset-2">Compras</Link>{' '}
              y{' '}
              <Link href="/dashboard/sales/new" className="font-medium text-primary underline underline-offset-2">Ventas</Link>,
              que descuentan o suman el stock solas.
            </FieldHint>
          )}
        </div>

        <div>
          <Label htmlFor="mv-product">Producto</Label>
          <Input
            type="search"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="Buscar por SKU o nombre"
            aria-label="Buscar producto por SKU o nombre"
            className="mb-1.5"
          />
          <select
            id="mv-product"
            value={form.productId}
            onChange={(e) => {
              // Se fija el elegido para que no desaparezca al cambiar la búsqueda.
              const chosen = productOptions.find((p) => p.id === e.target.value) ?? null;
              if (chosen) setPreselected(chosen);
              update('productId', e.target.value);
            }}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            <option value="">Seleccione producto</option>
            {productOptions.filter((p) => p.isTrackable || p.id === form.productId).map((p) => (
              <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
            ))}
          </select>
          {errors.productId && <p className="mt-1 text-sm text-destructive">{errors.productId}</p>}
        </div>

        <div>
          <FieldLabel htmlFor="mv-warehouse" term="bodega">{isTransfer ? 'Bodega de origen' : 'Bodega'}</FieldLabel>
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
            <FieldLabel htmlFor="mv-cost" term="pmp" hint="Al ingresar stock, este costo se promedia con el que ya tenías y recalcula el costo promedio (PMP).">
              Costo unitario (sin IVA)
            </FieldLabel>
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

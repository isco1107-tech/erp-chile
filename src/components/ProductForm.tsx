'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Category } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { calculateGrossPrice, formatCurrency } from '@/lib/chile/tax';
import { UNITS, productCreateSchema, productUpdateSchema } from '@/modules/inventory/schema';
import {
  createCategoryAction,
  createProductAction,
  updateProductAction,
} from '@/modules/inventory/actions/products.actions';
import type { ProductListItem } from '@/modules/inventory/services/products.service';

const EMPTY_FORM = {
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  unit: 'UN',
  isTrackable: true,
  isExempt: false,
  netPrice: '',
  minStock: '0',
};

type FormState = typeof EMPTY_FORM;

interface ProductFormProps {
  editingProduct: ProductListItem | null;
  categories: Category[];
  onSaved: () => void;
  onCancelEdit: () => void;
  onCategoryCreated: (category: Category) => void;
}

export default function ProductForm({
  editingProduct,
  categories,
  onSaved,
  onCancelEdit,
  onCategoryCreated,
}: ProductFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    if (editingProduct) {
      setForm({
        sku: editingProduct.sku,
        name: editingProduct.name,
        description: editingProduct.description ?? '',
        categoryId: editingProduct.categoryId ?? '',
        unit: editingProduct.unit,
        isTrackable: editingProduct.isTrackable,
        isExempt: editingProduct.isExempt,
        netPrice: String(editingProduct.netPrice),
        minStock: String(editingProduct.minStock),
      });
      setErrors({});
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editingProduct]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const netPriceNumber = Number(form.netPrice);
  const grossPricePreview =
    Number.isFinite(netPriceNumber) && form.netPrice !== ''
      ? calculateGrossPrice(netPriceNumber, form.isExempt)
      : null;

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setCreatingCategory(true);
    try {
      const result = await createCategoryAction({ name: newCategoryName.trim() });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onCategoryCreated(result.data);
      update('categoryId', result.data.id);
      setNewCategoryName('');
      toast.success('Categoría creada');
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = {
      sku: form.sku,
      name: form.name,
      description: form.description,
      categoryId: form.categoryId,
      unit: form.unit,
      isTrackable: form.isTrackable,
      isExempt: form.isExempt,
      netPrice: Number(form.netPrice),
      minStock: form.minStock === '' ? undefined : Number(form.minStock),
    };

    const schema = editingProduct ? productUpdateSchema : productCreateSchema;
    const parsed = schema.safeParse(payload);
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
      const result = editingProduct
        ? await updateProductAction(editingProduct.id, parsed.data)
        : await createProductAction(parsed.data);

      if (!result.success) {
        toast.error(result.error);
        setErrors({ form: result.error });
        return;
      }

      toast.success(result.message ?? 'Producto guardado');
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
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" value={form.sku} onChange={(e) => update('sku', e.target.value)} aria-invalid={!!errors.sku} />
          {errors.sku && <p className="mt-1 text-sm text-destructive">{errors.sku}</p>}
        </div>

        <div>
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} aria-invalid={!!errors.name} />
          {errors.name && <p className="mt-1 text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <Input id="description" value={form.description} onChange={(e) => update('description', e.target.value)} />
        </div>

        <div>
          <Label htmlFor="category">Categoría</Label>
          <select
            id="category"
            value={form.categoryId}
            onChange={(e) => update('categoryId', e.target.value)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="mt-1 flex gap-1">
            <Input
              placeholder="Nueva categoría"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="h-7 text-xs"
            />
            <Button type="button" size="xs" variant="outline" disabled={creatingCategory} onClick={handleCreateCategory}>
              + Agregar
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="unit">Unidad</Label>
          <select
            id="unit"
            value={form.unit}
            onChange={(e) => update('unit', e.target.value)}
            className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="netPrice">Precio Neto</Label>
          <CurrencyInput
            id="netPrice"
            value={Number(form.netPrice) || 0}
            onChange={(value) => update('netPrice', String(value))}
            aria-invalid={!!errors.netPrice}
          />
          {errors.netPrice && <p className="mt-1 text-sm text-destructive">{errors.netPrice}</p>}
        </div>

        <div>
          <Label>{form.isExempt ? 'Precio de Venta (exento de IVA)' : 'Precio Bruto (IVA 19% incluido)'}</Label>
          <div className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm">
            {grossPricePreview !== null ? formatCurrency(grossPricePreview) : '—'}
          </div>
        </div>

        <div>
          <Label htmlFor="minStock">Stock mínimo</Label>
          <Input
            id="minStock"
            type="number"
            min={0}
            step={1}
            value={form.minStock}
            onChange={(e) => update('minStock', e.target.value)}
            aria-invalid={!!errors.minStock}
          />
          {errors.minStock && <p className="mt-1 text-sm text-destructive">{errors.minStock}</p>}
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isTrackable}
              onChange={(e) => update('isTrackable', e.target.checked)}
            />
            Producto trackeable (gestiona stock)
          </label>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isExempt}
              onChange={(e) => update('isExempt', e.target.checked)}
            />
            Exento de IVA
          </label>
        </div>
      </div>

      {form.isExempt && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Las líneas de este producto no pagan IVA: su monto va al total exento del documento, tanto en ventas
          como en el Punto de Venta.
        </p>
      )}

      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : editingProduct ? 'Guardar cambios' : 'Crear producto'}
        </Button>
        {editingProduct && (
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

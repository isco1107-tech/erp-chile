'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Category } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { calculateGrossPrice, formatCurrency, netPriceForGross } from '@/lib/chile/tax';
import { bpsToInput, formatCommission, parseCommissionPercent } from '@/lib/consignment/commission';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { cn } from '@/lib/utils';
import { UNITS, UNIT_LABELS, productCreateSchema, productUpdateSchema } from '@/modules/inventory/schema';
import {
  createCategoryAction,
  createProductAction,
  updateProductAction,
} from '@/modules/inventory/actions/products.actions';
import { listConsignorOptionsAction } from '@/modules/inventory/actions/consignment.actions';
import type { ConsignorOption } from '@/modules/inventory/services/consignment.service';
import type { ProductListItem } from '@/modules/inventory/services/products.service';
import ProductPackagingsPanel from '@/components/inventory/ProductPackagingsPanel';
import { ImagePlus, X } from 'lucide-react';

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
  barcode: '',
  brand: '',
  imageUrl: '',
  tracksLots: false,
  /** Vacío = producto propio; si no, el id del seller dueño (consignación). */
  consignorId: '',
  /** Comisión propia del producto en %, como la escribe la persona. Vacío = la del seller. */
  consignmentCommission: '',
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
  // Precio con IVA que la persona está escribiendo (mientras tiene el foco): no se reescribe a cada tecla.
  const [grossTyped, setGrossTyped] = useState<number | null>(null);
  const [grossNotExact, setGrossNotExact] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Sellers de consignación; si la empresa no tiene ninguno, el campo de dueño no aparece.
  const [consignors, setConsignors] = useState<ConsignorOption[]>([]);
  useEffect(() => {
    let active = true;
    // Si no se pueden cargar los sellers, el campo de dueño simplemente no aparece: el producto se edita igual.
    listConsignorOptionsAction()
      .then((result) => active && result.success && setConsignors(result.data))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/products/image-upload', { method: 'POST', body });
      const json = (await res.json().catch(() => null)) as { success: boolean; data?: { url: string }; error?: string } | null;
      if (!json?.success || !json.data) return void toast.error(json?.error ?? 'No se pudo subir la imagen');
      update('imageUrl', json.data.url);
    } finally {
      setUploading(false);
    }
  }

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
        barcode: editingProduct.barcode ?? '',
        brand: editingProduct.brand ?? '',
        imageUrl: editingProduct.imageUrl ?? '',
        tracksLots: editingProduct.tracksLots,
        consignorId: editingProduct.consignorId ?? '',
        consignmentCommission: editingProduct.consignmentCommissionBps == null ? '' : bpsToInput(editingProduct.consignmentCommissionBps),
      });
      setErrors({});
    } else {
      setForm(EMPTY_FORM);
    }
  }, [editingProduct]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Comisión que regiría si el campo queda vacío: la del seller elegido.
  const sellerCommissionBps = consignors.find((seller) => seller.id === form.consignorId)?.commissionBps;
  const commissionPlaceholder = sellerCommissionBps == null ? 'La del seller' : `Vacío = la del seller (${formatCommission(sellerCommissionBps)})`;
  // Mientras los sellers no cargan (o si falló), el dueño actual del producto sigue apareciendo en la lista.
  const currentConsignorMissing = Boolean(editingProduct?.consignorId) && !consignors.some((seller) => seller.id === editingProduct?.consignorId);

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

    // Un porcentaje escrito pero inválido se avisa; vacío significa "usa la comisión del seller".
    const commissionText = form.consignmentCommission.trim();
    const consignmentCommissionBps = form.consignorId && commissionText !== '' ? parseCommissionPercent(commissionText) : null;
    if (form.consignorId && commissionText !== '' && consignmentCommissionBps === null) {
      setErrors({ consignmentCommission: 'La comisión debe ser un porcentaje entre 0 y 100' });
      return;
    }

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
      barcode: form.barcode.trim(),
      brand: form.brand.trim(),
      imageUrl: form.imageUrl,
      tracksLots: form.isTrackable && form.tracksLots,
      consignorId: form.consignorId || null,
      consignmentCommissionBps,
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

        <div>
          <Label htmlFor="barcode">Código de barras</Label>
          <Input
            id="barcode"
            value={form.barcode}
            onChange={(e) => update('barcode', e.target.value)}
            placeholder="Escanéalo o escríbelo (EAN-13, UPC…)"
            aria-invalid={!!errors.barcode}
            autoComplete="off"
          />
          {errors.barcode && <p className="mt-1 text-sm text-destructive">{errors.barcode}</p>}
        </div>

        <div>
          <Label htmlFor="brand">Marca</Label>
          <Input id="brand" value={form.brand} onChange={(e) => update('brand', e.target.value)} />
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
              <option key={u} value={u}>{UNIT_LABELS[u]}</option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="netPrice">Precio Neto</Label>
          <CurrencyInput
            id="netPrice"
            value={Number(form.netPrice) || 0}
            onChange={(value) => { update('netPrice', String(value)); setGrossNotExact(null); }}
            aria-invalid={!!errors.netPrice}
          />
          {errors.netPrice && <p className="mt-1 text-sm text-destructive">{errors.netPrice}</p>}
        </div>

        <div>
          <Label htmlFor="grossPrice">{form.isExempt ? 'Precio de Venta (exento de IVA)' : 'Precio al público (IVA 19% incluido)'}</Label>
          {/* Se puede escribir el precio final, como se piensa en el mesón: el neto se calcula solo. */}
          <CurrencyInput
            id="grossPrice"
            value={grossTyped ?? grossPricePreview ?? 0}
            onChange={(gross) => {
              setGrossTyped(gross);
              const { net, exact } = netPriceForGross(gross, form.isExempt);
              update('netPrice', gross === 0 ? '' : String(net));
              setGrossNotExact(exact ? null : gross);
            }}
            onBlur={() => setGrossTyped(null)}
          />
          {grossNotExact !== null && grossPricePreview !== null && grossTyped === null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(grossNotExact)} no calza exacto con IVA: quedó en {formatCurrency(grossPricePreview)} (el IVA se calcula sobre el neto).
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Escribe el neto o el precio final: el otro se calcula solo.</p>
          )}
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
            Controlar el stock de este producto (desmárcalo para servicios)
          </label>
        </div>

        <div className="flex items-end">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.isExempt}
              onChange={(e) => { update('isExempt', e.target.checked); setGrossNotExact(null); }}
            />
            <span>
              Exento de IVA
              <span className="block text-xs text-muted-foreground">
                Solo si la ley lo declara exento. Marcarlo por error hace cobrar menos IVA del que corresponde.
              </span>
            </span>
          </label>
        </div>

        {form.isTrackable && (
          <div className="flex items-end sm:col-span-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={form.tracksLots} onChange={(e) => update('tracksLots', e.target.checked)} />
              <span>
                Maneja lotes y vencimiento
                <span className="block text-xs text-muted-foreground">
                  Al ingresar stock se registra lote y fecha de vencimiento; al vender sale primero lo que vence antes.
                </span>
              </span>
            </label>
          </div>
        )}

        {(consignors.length > 0 || form.consignorId) && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-dashed border-border p-3 sm:col-span-2 sm:grid-cols-2">
            <div>
              <Label htmlFor="consignorId">Dueño del producto</Label>
              <select
                id="consignorId"
                value={form.consignorId}
                onChange={(e) => update('consignorId', e.target.value)}
                className={cn(nativeSelectClass, 'mt-1.5')}
              >
                <option value="">Propio (lo compras tú)</option>
                {currentConsignorMissing && editingProduct?.consignorId && <option value={editingProduct.consignorId}>Seller: {editingProduct.consignor?.name ?? 'dueño actual'}</option>}
                {consignors.map((seller) => (
                  <option key={seller.id} value={seller.id}>Seller: {seller.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Solo se puede cambiar con el stock en 0. Un producto de seller no entra a tu inventario valorizado.
              </p>
            </div>
            {form.consignorId && (
              <div>
                <Label htmlFor="consignmentCommission">Comisión de este producto (%)</Label>
                <Input
                  id="consignmentCommission"
                  inputMode="decimal"
                  className="mt-1.5"
                  placeholder={commissionPlaceholder}
                  value={form.consignmentCommission}
                  onChange={(e) => update('consignmentCommission', e.target.value)}
                  aria-invalid={!!errors.consignmentCommission}
                />
                {errors.consignmentCommission && <p role="alert" className="mt-1 text-sm text-destructive">{errors.consignmentCommission}</p>}
              </div>
            )}
          </div>
        )}

        <div className="sm:col-span-2">
          <Label>Foto</Label>
          <div className="mt-1.5 flex items-center gap-3">
            {form.imageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.imageUrl} alt="" className="size-16 rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 rounded-full border border-border bg-card p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Quitar foto"
                  onClick={() => update('imageUrl', '')}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <span className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                <ImagePlus className="size-5" aria-hidden="true" />
              </span>
            )}
            <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
              {uploading ? 'Subiendo…' : form.imageUrl ? 'Cambiar foto' : 'Subir foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { void handleImage(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <span className="text-xs text-muted-foreground">JPG, PNG o WEBP, hasta 3 MB.</span>
          </div>
        </div>
      </div>

      {editingProduct && <ProductPackagingsPanel productId={editingProduct.id} unit={form.unit} />}

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

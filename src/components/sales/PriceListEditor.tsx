'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Calculator, Plus, Search, Trash2, X } from 'lucide-react';
import type { Category } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-provider';
import { listProductsAction, listCategoriesAction } from '@/modules/inventory/actions/products.actions';
import type { ProductWithStock } from '@/modules/inventory/services/products.service';
import { deletePriceListAction, fillPriceListAction, savePriceListItemsAction, updatePriceListAction } from '@/modules/sales/actions/price-lists.actions';
import type { PriceListDetail } from '@/modules/sales/services/price-lists.service';
import { listDiscountPercent } from '@/modules/sales/pricing';
import { formatCurrency } from '@/lib/chile/tax';

/** Filas visibles a la vez: con catálogos grandes se busca, no se recorre. */
const PAGE = 100;

interface Tier {
  minQuantity: string;
  netPrice: string;
}

type Rows = Record<string, { base: string; tiers: Tier[] }>;

function rowsFromList(list: PriceListDetail): Rows {
  const rows: Rows = {};
  for (const item of list.items) {
    const row = (rows[item.productId] ??= { base: '', tiers: [] });
    if (item.minQuantity === 1) row.base = String(item.netPrice);
    else row.tiers.push({ minQuantity: String(item.minQuantity), netPrice: String(item.netPrice) });
  }
  return rows;
}

export default function PriceListEditor({ list, canWrite }: { list: PriceListDetail; canWrite: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rows, setRows] = useState<Rows>(() => rowsFromList(list));
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyPriced, setOnlyPriced] = useState(list.items.length > 0);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [isActive, setIsActive] = useState(list.isActive);
  const [percent, setPercent] = useState('-10');
  const [categoryId, setCategoryId] = useState('all');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listProductsAction().then((r) => r.success && setProducts(r.data));
    listCategoriesAction().then((r) => r.success && setCategories(r.data));
  }, []);

  useEffect(() => setRows(rowsFromList(list)), [list]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (onlyPriced && !rows[p.id]?.base && !(rows[p.id]?.tiers.length ?? 0)) return false;
      return !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
    });
  }, [products, rows, query, onlyPriced]);

  function edit(productId: string, change: (row: { base: string; tiers: Tier[] }) => { base: string; tiers: Tier[] }) {
    setRows((prev) => ({ ...prev, [productId]: change(prev[productId] ?? { base: '', tiers: [] }) }));
    setDirty(true);
  }

  async function saveItems() {
    const payload: { productId: string; minQuantity: number; netPrice: number }[] = [];
    for (const [productId, row] of Object.entries(rows)) {
      if (row.base.trim() !== '') payload.push({ productId, minQuantity: 1, netPrice: Math.round(Number(row.base)) });
      for (const tier of row.tiers) {
        if (tier.minQuantity.trim() === '' || tier.netPrice.trim() === '') continue;
        payload.push({ productId, minQuantity: Number(tier.minQuantity), netPrice: Math.round(Number(tier.netPrice)) });
      }
    }
    setBusy(true);
    const result = await savePriceListItemsAction(list.id, payload);
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Precios guardados');
    setDirty(false);
    router.refresh();
  }

  async function fill() {
    const value = Number(percent);
    if (!Number.isFinite(value)) return void toast.error('Ingresa un porcentaje válido');
    const scope = categoryId === 'all' ? 'todos los productos' : `la categoría ${categories.find((c) => c.id === categoryId)?.name ?? ''}`;
    const ok = await confirm(`Se calculará el precio de ${scope} como el precio del catálogo ${value >= 0 ? '+' : ''}${value}%. Los precios desde 1 unidad se reemplazan; los tramos por volumen se mantienen. ¿Continuar?`);
    if (!ok) return;
    setBusy(true);
    const result = await fillPriceListAction(list.id, { percent: value, categoryId: categoryId === 'all' ? undefined : categoryId });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Precios calculados');
    setOnlyPriced(true);
    router.refresh();
  }

  async function saveHeader() {
    setBusy(true);
    const result = await updatePriceListAction(list.id, { name, description: description || undefined, isActive });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Lista actualizada');
    router.refresh();
  }

  async function remove() {
    const ok = await confirm(`Se eliminará la lista "${list.name}". Los ${list._count.contacts} cliente(s) que la usan volverán al precio del catálogo.`);
    if (!ok) return;
    const result = await deletePriceListAction(list.id);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Lista eliminada');
    router.push('/dashboard/sales/price-lists');
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 shadow-card md:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label htmlFor="pl-name">Nombre</Label>
          <Input id="pl-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
        </div>
        <div>
          <Label htmlFor="pl-desc">Descripción</Label>
          <Input id="pl-desc" className="mt-1.5" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canWrite} />
        </div>
        <div className="flex items-end gap-3">
          <span className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} disabled={!canWrite} label="Lista activa" /> Activa
          </span>
          {canWrite && (
            <Button variant="outline" onClick={saveHeader} disabled={busy}>
              Guardar datos
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground md:col-span-3">
          {list._count.contacts} cliente(s) usan esta lista. Asígnala desde la ficha de cada cliente en Clientes &amp; Proveedores.
        </p>
      </section>

      {canWrite && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card lg:flex-row lg:items-end">
          <div className="flex items-center gap-2 text-sm font-medium lg:mb-2">
            <Calculator className="size-4 text-primary" aria-hidden="true" /> Calcular desde el catálogo
          </div>
          <div>
            <Label htmlFor="pl-percent">Ajuste sobre el precio base (%)</Label>
            <Input id="pl-percent" type="number" className="mt-1.5 w-32" value={percent} onChange={(e) => setPercent(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pl-cat">Productos</Label>
            <Select
              items={{ all: 'Todo el catálogo', ...Object.fromEntries(categories.map((c) => [c.id, c.name])) }}
              value={categoryId}
              onValueChange={(v) => setCategoryId(v as string)}
            >
              <SelectTrigger id="pl-cat" className="mt-1.5 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el catálogo</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={fill} disabled={busy || dirty} title={dirty ? 'Guarda los cambios antes de calcular' : undefined}>
            Aplicar
          </Button>
          <p className="text-xs text-muted-foreground lg:mb-2">Negativo = descuento. Ej.: -12 deja cada precio un 12% bajo el catálogo.</p>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card shadow-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" className="h-9 pl-8 sm:w-72" />
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={onlyPriced} onCheckedChange={setOnlyPriced} label="Mostrar solo productos con precio en la lista" /> Solo con precio en la lista
            </span>
            {canWrite && (
              <Button onClick={saveItems} disabled={busy || !dirty}>
                {busy ? 'Guardando…' : dirty ? 'Guardar precios' : 'Guardado'}
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-3 py-2.5 text-right font-medium">Catálogo</th>
                <th className="px-3 py-2.5 font-medium">Precio en la lista</th>
                <th className="px-3 py-2.5 font-medium">Por volumen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.slice(0, PAGE).map((product) => {
                const row = rows[product.id] ?? { base: '', tiers: [] };
                const discount = row.base ? listDiscountPercent(product.netPrice, Number(row.base)) : 0;
                return (
                  <tr key={product.id} className="align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{product.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{formatCurrency(product.netPrice)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-32"
                          placeholder="Precio catálogo"
                          value={row.base}
                          disabled={!canWrite}
                          aria-label={`Precio de ${product.name} en la lista`}
                          onChange={(e) => edit(product.id, (r) => ({ ...r, base: e.target.value }))}
                        />
                        {discount > 0 && <span className="text-xs text-success tabular-nums">-{discount}%</span>}
                        {row.base && canWrite && (
                          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Quitar precio" onClick={() => edit(product.id, (r) => ({ ...r, base: '' }))}>
                            <X className="size-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-1.5">
                        {row.tiers.map((tier, index) => (
                          <div key={index} className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">desde</span>
                            <Input
                              type="number"
                              min={1}
                              className="h-7 w-16"
                              value={tier.minQuantity}
                              disabled={!canWrite}
                              aria-label="Cantidad mínima"
                              onChange={(e) => edit(product.id, (r) => ({ ...r, tiers: r.tiers.map((t, i) => (i === index ? { ...t, minQuantity: e.target.value } : t)) }))}
                            />
                            <span className="text-muted-foreground">u. a</span>
                            <Input
                              type="number"
                              min={0}
                              className="h-7 w-24"
                              value={tier.netPrice}
                              disabled={!canWrite}
                              aria-label="Precio por volumen"
                              onChange={(e) => edit(product.id, (r) => ({ ...r, tiers: r.tiers.map((t, i) => (i === index ? { ...t, netPrice: e.target.value } : t)) }))}
                            />
                            {canWrite && (
                              <button type="button" className="text-muted-foreground hover:text-danger" aria-label="Quitar tramo" onClick={() => edit(product.id, (r) => ({ ...r, tiers: r.tiers.filter((_, i) => i !== index) }))}>
                                <Trash2 className="size-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        ))}
                        {canWrite && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => edit(product.id, (r) => ({ ...r, tiers: [...r.tiers, { minQuantity: '10', netPrice: r.base || String(product.netPrice) }] }))}
                          >
                            <Plus className="size-3" aria-hidden="true" /> Tramo por volumen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {visible.length > PAGE ? `Mostrando ${PAGE} de ${visible.length}: busca para encontrar el resto. ` : ''}
          Un producto sin precio en la lista se vende al precio del catálogo.
        </p>
      </section>

      {canWrite && (
        <div className="flex justify-end">
          <Button variant="ghost" className="text-danger" onClick={remove}>
            <Trash2 aria-hidden="true" /> Eliminar lista
          </Button>
        </div>
      )}
    </div>
  );
}

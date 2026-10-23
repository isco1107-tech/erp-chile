'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { textareaClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { ImageUploader } from '@/components/web-sites/ImageUploader';
import { getStoreProductAction, removeStoreProductAction, saveStoreProductAction } from '@/modules/ecommerce/actions/store.actions';
import type { SiteAssetRow, StoreProductDetail } from '@/modules/ecommerce/services/store-catalog.service';
import { ACTION_ERROR } from './store-admin-shared';

interface Draft {
  title: string;
  summary: string;
  description: string;
  images: Array<{ url: string; alt: string }>;
  compareAtPrice: number;
  collection: string;
  featured: boolean;
  sortOrder: number;
  maxPerOrder: number;
  slug: string;
}

function toDraft(product: StoreProductDetail): Draft {
  return {
    title: product.title,
    summary: product.summary,
    description: product.description,
    images: product.images.map((image) => ({ url: image.url, alt: image.alt })),
    compareAtPrice: product.compareAtPrice ?? 0,
    collection: product.collection,
    featured: product.featured,
    sortOrder: product.sortOrder,
    maxPerOrder: product.maxPerOrder ?? 0,
    slug: product.slug,
  };
}

/** Ficha de venta de un producto: cómo se presenta en la tienda. No cambia precio ni stock (son del inventario). */
export default function ProductSheetDialog({ siteId, productId, canWrite, canUploadImages, onClose, onSaved }: { siteId: string; productId: string | null; canWrite: boolean; canUploadImages: boolean; onClose: () => void; onSaved: () => void }) {
  const confirm = useConfirm();
  const [product, setProduct] = useState<StoreProductDetail | null>(null);
  const [assets, setAssets] = useState<SiteAssetRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const patch = (changes: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...changes } : current));

  useEffect(() => {
    setProduct(null);
    setDraft(null);
    setError(null);
    if (!productId) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await getStoreProductAction(siteId, productId);
        if (cancelled) return;
        if (result.success) {
          setProduct(result.data.product);
          setAssets(result.data.assets);
          setDraft(toDraft(result.data.product));
        } else {
          setError(result.error);
        }
      } catch {
        if (!cancelled) setError(ACTION_ERROR);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, productId]);

  async function save() {
    if (!productId || !draft) return;
    setSaving(true);
    try {
      const result = await saveStoreProductAction(siteId, productId, {
        title: draft.title,
        summary: draft.summary,
        description: draft.description,
        images: draft.images,
        compareAtPrice: draft.compareAtPrice > 0 ? draft.compareAtPrice : null,
        collection: draft.collection,
        featured: draft.featured,
        sortOrder: draft.sortOrder,
        maxPerOrder: draft.maxPerOrder > 0 ? draft.maxPerOrder : null,
        slug: draft.slug || undefined,
      });
      if (result.success) {
        toast.success(result.message ?? 'Ficha guardada');
        onSaved();
        onClose();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!productId || !product) return;
    if (!(await confirm({ title: `¿Quitar «${product.name}» de la tienda?`, description: 'Se borra su ficha de venta (fotos, descripción, colección). El producto sigue en tu inventario.', confirmLabel: 'Quitar de la tienda', destructive: true }))) return;
    setSaving(true);
    try {
      const result = await removeStoreProductAction(siteId, productId);
      if (result.success) {
        toast.success(result.message ?? 'Listo');
        onSaved();
        onClose();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setSaving(false);
    }
  }

  const inDraft = new Set(draft?.images.map((image) => image.url));
  const move = (index: number, delta: number) =>
    setDraft((current) => {
      if (!current) return current;
      const images = [...current.images];
      const target = index + delta;
      if (target < 0 || target >= images.length) return current;
      [images[index], images[target]] = [images[target]!, images[index]!];
      return { ...current, images };
    });

  return (
    <Dialog open={productId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? `Ficha de venta: ${product.name}` : 'Ficha de venta'}</DialogTitle>
          <DialogDescription>
            {product ? <>SKU {product.sku} · {formatCurrency(product.grossPrice)} con IVA (se cambia en Inventario).</> : 'Cargando…'}
          </DialogDescription>
        </DialogHeader>

        {error && !draft && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {!draft && !error && <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Cargando…</p>}

        {draft && product && (
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <fieldset disabled={!canWrite || saving} className="space-y-4">
              <label className="block space-y-1 text-sm font-medium">
                Nombre en la tienda
                <Input value={draft.title} onChange={(event) => patch({ title: event.target.value })} maxLength={120} placeholder={product.name} />
                <span className="block text-xs font-normal text-muted-foreground">Vacío = el nombre del inventario.</span>
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Resumen corto
                <Input value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} maxLength={200} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Descripción
                <textarea className={textareaClass} value={draft.description} onChange={(event) => patch({ description: event.target.value })} maxLength={4000} rows={5} placeholder={product.erpDescription || 'Cuenta de qué se trata, cómo se usa, qué incluye…'} />
                <span className="block text-xs font-normal text-muted-foreground">Separa los párrafos con una línea en blanco.</span>
              </label>

              <div className="space-y-2">
                <p className="text-sm font-medium">Fotos ({draft.images.length}/8)</p>
                {draft.images.length > 0 && (
                  <ul className="grid gap-2">
                    {draft.images.map((image, index) => (
                      <li key={image.url} className="flex items-center gap-3 rounded-lg border border-border p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt="" className="size-14 shrink-0 rounded-md object-cover" />
                        <label className="min-w-0 grow text-xs text-muted-foreground">
                          {index === 0 ? 'Foto principal · descripción' : 'Descripción de la foto'}
                          <Input value={image.alt} onChange={(event) => patch({ images: draft.images.map((item, i) => (i === index ? { ...item, alt: event.target.value } : item)) })} maxLength={160} className="mt-1 h-8" />
                        </label>
                        <div className="flex shrink-0 gap-1">
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir la foto" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" aria-hidden="true" /></Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Bajar la foto" disabled={index === draft.images.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" aria-hidden="true" /></Button>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar la foto" onClick={() => patch({ images: draft.images.filter((_, i) => i !== index) })}><Trash2 className="size-4" aria-hidden="true" /></Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {draft.images.length < 8 && assets.filter((asset) => !inDraft.has(asset.url)).length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Biblioteca del sitio: toca una foto para agregarla.</p>
                    <ul className="flex flex-wrap gap-2">
                      {assets.filter((asset) => !inDraft.has(asset.url)).slice(0, 24).map((asset) => (
                        <li key={asset.id}>
                          <button type="button" className="overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-ring" aria-label={`Agregar ${asset.fileName}`} onClick={() => patch({ images: [...draft.images, { url: asset.url, alt: asset.alt }].slice(0, 8) })}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.url} alt="" className="size-14 object-cover" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {canUploadImages && draft.images.length < 8 && (
                  <ImageUploader
                    siteId={siteId}
                    uploadEndpoint="/api/store/asset-upload"
                    disabled={!canWrite || saving}
                    onUploaded={(asset) => {
                      setAssets((current) => [{ id: asset.id, url: asset.url, fileName: asset.fileName, alt: asset.alt }, ...current]);
                      setDraft((current) => (current && current.images.length < 8 ? { ...current, images: [...current.images, { url: asset.url, alt: asset.alt }] } : current));
                    }}
                  />
                )}
                {!canUploadImages && <p className="text-xs text-muted-foreground">Para subir fotos nuevas necesitas el permiso de editar la tienda; puedes elegir las que ya están en la biblioteca.</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1 text-sm font-medium">
                  Colección
                  <Input value={draft.collection} onChange={(event) => patch({ collection: event.target.value })} maxLength={40} list="store-collections" placeholder="Ej. Despensa" />
                  <datalist id="store-collections">{product.collections.map((name) => <option key={name} value={name} />)}</datalist>
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  Máximo por pedido
                  <Input type="number" min={0} max={99} value={draft.maxPerOrder || ''} onChange={(event) => patch({ maxPerOrder: Math.max(0, Math.min(99, Number(event.target.value) || 0)) })} placeholder="Sin tope" />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  Precio anterior (tachado)
                  <CurrencyInput value={draft.compareAtPrice} onChange={(value) => patch({ compareAtPrice: value })} placeholder="Sin descuento" />
                  <span className="block text-xs font-normal text-muted-foreground">Debe ser mayor al precio actual para mostrarse.</span>
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  Orden en el catálogo
                  <Input type="number" min={0} max={100000} value={draft.sortOrder} onChange={(event) => patch({ sortOrder: Math.max(0, Math.min(100000, Number(event.target.value) || 0)) })} />
                  <span className="block text-xs font-normal text-muted-foreground">Menor número, primero. Los destacados van antes.</span>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={draft.featured} onChange={(event) => patch({ featured: event.target.checked })} /> Destacado (aparece primero)
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Dirección en internet
                <Input value={draft.slug} onChange={(event) => patch({ slug: event.target.value.toLowerCase() })} maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
                <span className="block text-xs font-normal text-muted-foreground">Solo minúsculas, números y guiones. Cambiarla cambia el enlace del producto.</span>
              </label>
            </fieldset>

            <DialogFooter className="flex-wrap">
              {canWrite && (
                <Button type="button" variant="ghost" className="mr-auto" disabled={saving} onClick={remove}>
                  Quitar de la tienda
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
              {canWrite && <Button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar ficha'}</Button>}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

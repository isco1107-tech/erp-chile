'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { listStoreCatalogAction, setProductsPublishedAction } from '@/modules/ecommerce/actions/store.actions';
import type { StoreCatalogPage } from '@/modules/ecommerce/services/store-catalog.service';
import ProductSheetDialog from './ProductSheetDialog';
import { ACTION_ERROR } from './store-admin-shared';

type Filter = 'all' | 'published' | 'unpublished';

export default function ProductsPanel({ siteId, canWrite, canUploadImages, onChanged }: { siteId: string; canWrite: boolean; canUploadImages: boolean; onChanged: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StoreCatalogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await listStoreCatalogAction(siteId, { filter, q: query.trim() || undefined, page });
        if (cancelled) return;
        if (result.success) {
          setData(result.data);
          setError(null);
        } else {
          setError(result.error);
          toast.error(result.error);
        }
      } catch {
        if (!cancelled) {
          setError(ACTION_ERROR);
          toast.error(ACTION_ERROR);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [siteId, filter, query, page, reloadKey]);

  const rows = data?.rows ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.productId));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function publish(published: boolean, ids: string[]) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const result = await setProductsPublishedAction(siteId, { productIds: ids, published });
      if (result.success) {
        toast.success(result.message ?? 'Listo');
        setSelected(new Set());
        setReloadKey((value) => value + 1);
        onChanged();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error(ACTION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Productos de la tienda" className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Elige cuáles productos de tu inventario se venden por internet. El precio, el IVA y el stock siempre son los del inventario: acá solo decides cómo se presentan (nombre, fotos, descripción, colección).
        {data && <> Tienes <strong className="text-foreground">{data.publishedCount}</strong> publicados.</>}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Buscar por nombre, SKU o marca" aria-label="Buscar productos" className="pl-9" maxLength={100} />
        </div>
        <select aria-label="Filtrar productos" className={cn(nativeSelectClass, 'w-auto')} value={filter} onChange={(event) => { setFilter(event.target.value as Filter); setPage(1); }}>
          <option value="all">Todos</option>
          <option value="published">Publicados</option>
          <option value="unpublished">Sin publicar</option>
        </select>
        {canWrite && selected.size > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-2" role="group" aria-label="Acciones sobre los seleccionados">
            <span className="text-sm text-muted-foreground">{selected.size} seleccionados</span>
            <Button size="sm" disabled={busy} onClick={() => publish(true, [...selected])}><Eye className="size-4" aria-hidden="true" /> Publicar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => publish(false, [...selected])}><EyeOff className="size-4" aria-hidden="true" /> Quitar de la tienda</Button>
          </span>
        )}
      </div>

      {error && !data ? (
        <EmptyState title="No pudimos cargar los productos" description={error} actionLabel="Reintentar" onAction={() => setReloadKey((value) => value + 1)} />
      ) : loading && !data ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title={query || filter !== 'all' ? 'No hay productos con ese filtro' : 'Tu inventario no tiene productos'} description={query || filter !== 'all' ? 'Prueba con otra búsqueda.' : 'Crea productos en Inventario para poder venderlos por internet.'} />
      ) : (
        <div className={cn('overflow-x-auto rounded-lg border border-border bg-card', loading && 'opacity-60')} aria-busy={loading}>
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="w-10 px-4 py-2.5">
                  {canWrite && <input type="checkbox" aria-label="Seleccionar todos los de esta página" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.productId)))} />}
                </th>
                <th scope="col" className="px-2 py-2.5 font-medium">Producto</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Precio con IVA</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Disponible</th>
                <th scope="col" className="px-4 py-2.5 font-medium">En la tienda</th>
                <th scope="col" className="w-12 px-4 py-2.5"><span className="sr-only">Editar</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.productId} className="hover:bg-muted/40">
                  <td className="px-4 py-3 align-top">{canWrite && <input type="checkbox" aria-label={`Seleccionar ${row.name}`} checked={selected.has(row.productId)} onChange={() => toggle(row.productId)} />}</td>
                  <td className="px-2 py-3 align-top">
                    <p className="font-medium break-words">{row.title || row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.sku}{row.brand ? ` · ${row.brand}` : ''}{row.collection ? ` · ${row.collection}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">{formatCurrency(row.grossPrice)}</td>
                  <td className="px-4 py-3 text-right align-top tabular-nums">
                    {row.available === null ? <span className="text-muted-foreground">Sin control</span> : row.available <= 0 ? <span className="font-medium text-danger">Agotado</span> : row.available}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {row.published ? <StatusBadge tone="success">Publicado</StatusBadge> : <StatusBadge tone="neutral">Sin publicar</StatusBadge>}
                    {row.featured && row.published && <span className="ml-1.5"><StatusBadge tone="accent">Destacado</StatusBadge></span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar la ficha de ${row.name}`} onClick={() => setEditing(row.productId)}>
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <nav aria-label="Páginas de productos" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Página {data.page} de {pages} · {data.total} productos</span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>Siguiente</Button>
          </span>
        </nav>
      )}

      <ProductSheetDialog
        siteId={siteId}
        productId={editing}
        canWrite={canWrite}
        canUploadImages={canUploadImages}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setReloadKey((value) => value + 1);
          onChanged();
        }}
      />
    </section>
  );
}

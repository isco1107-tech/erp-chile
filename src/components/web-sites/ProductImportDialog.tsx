'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, PackageSearch, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/chile/tax';
import { catalogItemSchema, MAX_CATALOG_ITEMS } from '@/lib/web-sites/blocks';
import { safeImageSrc } from '@/lib/web-sites/urls';
import { cn } from '@/lib/utils';
import { listCatalogProductsAction } from '@/modules/web-sites/actions/web-sites.actions';
import type { CatalogProductRow } from '@/modules/web-sites/services/web-sites.service';
import type { z } from 'zod';

type CatalogItem = z.infer<typeof catalogItemSchema>;

/** Producto del inventario → ficha del catálogo del sitio (precio con IVA, código = SKU). */
export function productToCatalogItem(product: CatalogProductRow): CatalogItem {
  return catalogItemSchema.parse({
    imageUrl: product.imageUrl ?? '',
    title: product.name.slice(0, 80),
    price: product.grossPrice > 0 ? formatCurrency(product.grossPrice) : '',
    description: product.description.slice(0, 300),
    details: product.brand ? product.brand.slice(0, 200) : '',
    code: product.sku.slice(0, 30),
  });
}

interface ProductImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cuántas fichas tiene ya el catálogo (para respetar el máximo). */
  current: number;
  onImport: (items: CatalogItem[]) => void;
}

/**
 * Trae productos del inventario del ERP al catálogo del sitio: nombre, foto,
 * precio con IVA y código, listos para "Pedir por WhatsApp". Es una copia:
 * si después cambias el precio en el inventario, vuelve a importarlo.
 */
export function ProductImportDialog({ open, onOpenChange, current, onImport }: ProductImportDialogProps) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CatalogProductRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const room = Math.max(0, MAX_CATALOG_ITEMS - current);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      listCatalogProductsAction(query)
        .then((result) => {
          if (cancelled) return;
          if (result.success) {
            setRows(result.data);
            setError(null);
          } else setError(result.error);
        })
        .catch(() => !cancelled && setError('No pudimos cargar los productos. Revisa tu conexión.'))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < room) next.add(id);
      else toast.error(`El catálogo admite hasta ${MAX_CATALOG_ITEMS} fichas.`);
      return next;
    });
  }

  function confirm() {
    const chosen = (rows ?? []).filter((row) => selected.has(row.id));
    onImport(chosen.map(productToCatalogItem));
    setSelected(new Set());
    onOpenChange(false);
    toast.success(`${chosen.length} producto${chosen.length === 1 ? '' : 's'} agregado${chosen.length === 1 ? '' : 's'} al catálogo`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Traer productos de tu inventario</DialogTitle>
          <DialogDescription>Elige los productos: se agregan al catálogo con su foto, nombre, precio con IVA y código. Después puedes editar cada ficha.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, código o marca" aria-label="Buscar productos" className="pl-9" />
        </div>
        <div className="max-h-[50vh] min-h-40 overflow-y-auto rounded-lg border border-border">
          {loading && !rows ? (
            <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Cargando productos…
            </p>
          ) : error ? (
            <p role="alert" className="p-6 text-sm text-danger">
              {error}
            </p>
          ) : rows && rows.length === 0 ? (
            <p className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <PackageSearch className="size-6" aria-hidden="true" />
              {query ? 'Ningún producto coincide con la búsqueda.' : 'Todavía no tienes productos en el inventario.'}
            </p>
          ) : (
            <ul className="divide-y divide-border" aria-label="Productos">
              {(rows ?? []).map((row) => {
                const checked = selected.has(row.id);
                const src = safeImageSrc(row.imageUrl);
                return (
                  <li key={row.id}>
                    <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted', checked && 'bg-accent/50')}>
                      <input type="checkbox" className="size-4" checked={checked} onChange={() => toggle(row.id)} />
                      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {src ? <img src={src} alt="" className="size-full object-cover" /> : <PackageSearch className="size-4 text-muted-foreground" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.sku}
                          {row.brand ? ` · ${row.brand}` : ''}
                          {src ? '' : ' · sin foto'}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{row.grossPrice > 0 ? formatCurrency(row.grossPrice) : 'Sin precio'}</span>
                      {checked ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {selected.size} elegido{selected.size === 1 ? '' : 's'} · caben {room} más
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={selected.size === 0} onClick={confirm}>
              Agregar al catálogo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

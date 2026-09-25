'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { listProductsAction } from '@/modules/inventory/actions/products.actions';

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
  isTrackable: boolean;
  barcode: string | null;
  /** Precio de venta neto del catálogo. */
  netPrice: number;
}

/**
 * Buscador de productos del catálogo para agregar líneas. Carga el catálogo
 * una vez y filtra en el navegador por SKU, nombre o código de barras.
 */
export function ProductSearch({
  onPick,
  placeholder = 'Buscar producto por SKU, nombre o código de barras',
  onlyTrackable = false,
  id,
}: {
  onPick: (product: ProductOption) => void;
  placeholder?: string;
  onlyTrackable?: boolean;
  id?: string;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    listProductsAction().then((result) => {
      if (cancelled || !result.success) return;
      setProducts(result.data.map((product) => ({ id: product.id, sku: product.sku, name: product.name, unit: product.unit, isTrackable: product.isTrackable, barcode: product.barcode, netPrice: product.netPrice })));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((product) => (!onlyTrackable || product.isTrackable) && (product.sku.toLowerCase().includes(q) || product.name.toLowerCase().includes(q) || product.barcode === query.trim()))
      .slice(0, 8);
  }, [products, query, onlyTrackable]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
      <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label="Buscar producto" className="pl-8" />
      {matches.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card text-sm shadow-card" role="listbox">
          {matches.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onPick(product);
                  setQuery('');
                }}
              >
                <span className="truncate">{product.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{product.sku}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

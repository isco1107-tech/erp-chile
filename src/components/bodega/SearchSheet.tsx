'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, WifiOff } from 'lucide-react';
import { looksLikeCode } from '@/lib/warehouse-mobile/codes';
import type { MobileProduct } from '@/modules/warehouse-mobile/types';
import { useBodega } from './BodegaProvider';
import { ProductImage, Sheet, Spinner, formatQty, inputClass } from './ui';

/**
 * Búsqueda a mano de un producto del catálogo, por nombre, marca, SKU o código.
 * Sirve para agregar productos a la lista, para elegir cuál es el de una foto
 * que no se pudo reconocer y para consultar cuánto hay de algo.
 */

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  /** `factor` > 1 cuando el código escrito era de una caja (se suman esas unidades). */
  onPick: (product: MobileProduct, factor: number) => void;
  initialQuery?: string;
}

const DEBOUNCE_MS = 300;

export default function SearchSheet({ open, title, onClose, onPick, initialQuery = '' }: Props) {
  const { api, warehouseId, online } = useBodega();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Array<{ product: MobileProduct; factor: number; exact: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setFailed(null);
      setLoading(false);
      return;
    }
    const mine = ++request.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const found: Array<{ product: MobileProduct; factor: number; exact: boolean }> = [];
      let problem: string | null = null;

      if (looksLikeCode(text)) {
        const byCode = await api.lookupCode(text, warehouseId);
        if (byCode.ok && byCode.data.match) found.push({ product: byCode.data.match, factor: byCode.data.match.factor, exact: true });
        else if (!byCode.ok) problem = byCode.failure.message;
      }
      const byText = await api.search(text, warehouseId);
      if (byText.ok) {
        for (const product of byText.data.results) if (!found.some((entry) => entry.product.id === product.id)) found.push({ product, factor: 1, exact: false });
      } else {
        problem = byText.failure.message;
      }

      if (mine !== request.current) return;
      setResults(found);
      setFailed(found.length === 0 ? problem : null);
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, open, query, warehouseId]);

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre, marca, SKU o código"
          aria-label="Buscar producto"
          className={`${inputClass} pl-10`}
        />
        {loading ? <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground" /> : null}
      </div>

      {!online ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <WifiOff className="size-4 shrink-0" /> Sin conexión: no se puede buscar ahora.
        </p>
      ) : null}

      <ul className="mt-3 space-y-2" aria-live="polite">
        {results.map(({ product, factor, exact }) => (
          <li key={product.id}>
            <button type="button" onClick={() => onPick(product, factor)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left active:bg-muted">
              <ProductImage url={product.imageUrl} name={product.name} className="size-14" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{product.name}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {product.sku}
                  {product.brand ? ` · ${product.brand}` : ''}
                </span>
                <span className="block text-sm text-muted-foreground">
                  Hay {formatQty(product.stock)} {product.unit}
                  {exact ? ' · coincide con el código' : ''}
                  {factor > 1 ? ` · caja de ${formatQty(factor)}` : ''}
                  {!product.isActive ? ' · archivado' : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!loading && query.trim().length >= 2 && results.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">{failed ?? 'No encontré nada con eso. Prueba con otra palabra o el código.'}</p>
      ) : null}
      {query.trim().length < 2 ? <p className="mt-6 text-center text-sm text-muted-foreground">Escribe al menos 2 letras o escanea un código.</p> : null}
    </Sheet>
  );
}

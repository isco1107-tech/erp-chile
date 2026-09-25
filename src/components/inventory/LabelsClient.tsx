'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Printer, ScanLine, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { formatCurrency } from '@/lib/chile/tax';
import { isEncodable } from '@/lib/barcode/code128';
import { cn } from '@/lib/utils';
import { findProductByCodeAction, listProductsAction } from '@/modules/inventory/actions/products.actions';
import { BarcodeSvg } from './BarcodeSvg';

type Layout = 'a4-24' | 'a4-40' | 'roll';

const LAYOUTS: Record<Layout, { label: string; perPage: number; columns: number; width: string; height: string }> = {
  'a4-24': { label: 'Hoja A4 · 24 etiquetas (64 × 34 mm)', perPage: 24, columns: 3, width: '63.5mm', height: '33.9mm' },
  'a4-40': { label: 'Hoja A4 · 40 etiquetas (48 × 25 mm)', perPage: 40, columns: 4, width: '48.5mm', height: '25.4mm' },
  roll: { label: 'Rollo para impresora de etiquetas (50 × 25 mm)', perPage: 1, columns: 1, width: '50mm', height: '25mm' },
};

const MAX_LABELS = 1000;

interface LabelProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  grossPrice: number;
  unit: string;
}

interface Selected {
  product: LabelProduct;
  copies: number;
}

function toLabelProduct(product: LabelProduct): LabelProduct {
  return { id: product.id, sku: product.sku, name: product.name, barcode: product.barcode, grossPrice: product.grossPrice, unit: product.unit };
}

/** El código que va en la etiqueta: el de barras del producto o, si no tiene, el SKU. */
function labelCode(product: LabelProduct): string {
  return product.barcode ?? product.sku;
}

export default function LabelsClient() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LabelProduct[]>([]);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [layout, setLayout] = useState<Layout>('a4-24');
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await listProductsAction(term);
      if (cancelled) return;
      if (result.success) setResults(result.data.slice(0, 8).map(toLabelProduct));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function add(product: LabelProduct, copies = 1) {
    setSelected((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) return prev.map((item) => (item.product.id === product.id ? { ...item, copies: Math.min(MAX_LABELS, item.copies + copies) } : item));
      return [...prev, { product, copies }];
    });
    setQuery('');
    setResults([]);
  }

  async function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    // Enter con un código exacto (lector) agrega directo; si no, el primer resultado.
    const match = await findProductByCodeAction(term);
    if (match.success && match.data) {
      add(toLabelProduct(match.data.product));
      return;
    }
    if (results[0]) add(results[0]);
    else toast.error('No se encontró un producto con ese código');
  }

  const labels = useMemo(() => selected.flatMap((item) => Array.from({ length: item.copies }, () => item.product)).slice(0, MAX_LABELS), [selected]);
  const config = LAYOUTS[layout];
  const pages = useMemo(() => {
    const chunks: LabelProduct[][] = [];
    for (let index = 0; index < labels.length; index += config.perPage) chunks.push(labels.slice(index, index + config.perPage));
    return chunks;
  }, [labels, config.perPage]);
  const unencodable = selected.filter((item) => !isEncodable(labelCode(item.product)));

  function print() {
    document.documentElement.classList.add('labels-printing');
    window.print();
    document.documentElement.classList.remove('labels-printing');
  }

  const compact = layout !== 'a4-24';

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="h-fit space-y-4 rounded-lg border border-border bg-card p-4 shadow-card print:hidden" aria-label="Productos a etiquetar">
        <div className="relative">
          <Label htmlFor="label-search">Agregar producto</Label>
          <div className="relative">
            <ScanLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="label-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Nombre, SKU o escanea el código"
              className="h-10 pl-8"
              autoComplete="off"
            />
          </div>
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-popover" role="listbox" aria-label="Resultados">
              {results.map((product) => (
                <li key={product.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => add(product)}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{product.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{labelCode(product)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatCurrency(product.grossPrice)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {selected.map((item) => (
              <li key={item.product.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.product.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{labelCode(item.product)}</p>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={MAX_LABELS}
                  value={item.copies}
                  onChange={(e) => {
                    const copies = Math.max(1, Math.min(MAX_LABELS, Math.floor(Number(e.target.value) || 1)));
                    setSelected((prev) => prev.map((row) => (row.product.id === item.product.id ? { ...row, copies } : row)));
                  }}
                  aria-label={`Copias de ${item.product.name}`}
                  className="h-8 w-20 text-right tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar ${item.product.name}`}
                  onClick={() => setSelected((prev) => prev.filter((row) => row.product.id !== item.product.id))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <Label htmlFor="label-layout">Formato</Label>
            <select id="label-layout" className={nativeSelectClass} value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
              {(Object.keys(LAYOUTS) as Layout[]).map((key) => (
                <option key={key} value={key}>{LAYOUTS[key].label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
            Mostrar precio (con IVA)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={showSku} onChange={(e) => setShowSku(e.target.checked)} />
            Mostrar SKU
          </label>
        </div>

        {unencodable.length > 0 && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            {unencodable.map((item) => item.product.name).join(', ')}: el código tiene caracteres que un lector no admite (tildes o Ñ). Asígnale un código de barras en la ficha del producto.
          </p>
        )}

        <Button type="button" className="w-full" onClick={print} disabled={labels.length === 0}>
          <Printer className="size-4" aria-hidden="true" /> Imprimir {labels.length > 0 ? `${labels.length} etiqueta${labels.length === 1 ? '' : 's'}` : 'etiquetas'}
        </Button>
        <p className="text-xs text-muted-foreground">En el diálogo de impresión usa escala 100% y sin encabezados ni pies de página.</p>
      </section>

      <section aria-label="Vista previa" className="min-w-0">
        {labels.length === 0 ? (
          <div className="rounded-lg border border-border bg-card shadow-card print:hidden">
            <EmptyState
              icon={<Tags className="size-10 text-muted-foreground/40" aria-hidden="true" />}
              title="Agrega productos para ver la vista previa"
              description="Busca por nombre o pasa el lector por el código. Cada producto puede llevar varias copias."
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 print:overflow-visible print:border-0 print:bg-transparent print:p-0">
            <div className="label-sheet space-y-4 print:space-y-0" data-layout={layout}>
              {pages.map((page, pageIndex) => (
                <div
                  key={pageIndex}
                  className="grid bg-white shadow-card print:shadow-none"
                  style={{
                    gridTemplateColumns: `repeat(${config.columns}, ${config.width})`,
                    gridAutoRows: config.height,
                    columnGap: layout === 'a4-24' ? '2.5mm' : 0,
                    width: 'fit-content',
                    breakAfter: pageIndex < pages.length - 1 ? 'page' : 'auto',
                  }}
                >
                  {page.map((product, index) => (
                    <div
                      key={`${product.id}-${index}`}
                      className={cn('flex flex-col justify-between overflow-hidden border border-dashed border-neutral-300 text-black print:border-transparent', compact ? 'px-[2mm] py-[1.5mm]' : 'px-[3mm] py-[2mm]')}
                      style={{ breakInside: 'avoid' }}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className={cn('line-clamp-2 leading-tight font-semibold', compact ? 'text-[7pt]' : 'text-[8.5pt]')}>{product.name}</p>
                        {showPrice && <p className={cn('shrink-0 font-bold tabular-nums', compact ? 'text-[9pt]' : 'text-[12pt]')}>{formatCurrency(product.grossPrice)}</p>}
                      </div>
                      <div>
                        <BarcodeSvg value={labelCode(product)} className={cn('w-full', compact ? 'h-[8mm]' : 'h-[11mm]')} />
                        <p className="flex justify-between font-mono text-[6.5pt] leading-tight">
                          <span>{labelCode(product)}</span>
                          {showSku && product.barcode && <span>SKU {product.sku}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

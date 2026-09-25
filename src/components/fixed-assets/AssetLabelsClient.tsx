'use client';

import { useMemo, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { BarcodeSvg } from '@/components/inventory/BarcodeSvg';
import { isEncodable } from '@/lib/barcode/code128';
import { cn } from '@/lib/utils';

type Layout = 'a4-24' | 'a4-40';

const LAYOUTS: Record<Layout, { label: string; perPage: number; columns: number; width: string; height: string }> = {
  'a4-24': { label: 'Hoja A4 · 24 etiquetas (64 × 34 mm)', perPage: 24, columns: 3, width: '63.5mm', height: '33.9mm' },
  'a4-40': { label: 'Hoja A4 · 40 etiquetas (48 × 25 mm)', perPage: 40, columns: 4, width: '48.5mm', height: '25.4mm' },
};

export interface LabelAsset {
  id: string;
  code: string;
  name: string;
  location: string | null;
  category: string;
}

/**
 * Etiquetas de inventario de activo fijo: nombre del bien, código de barras
 * con su código interno y ubicación. Misma hoja e interruptor de impresión
 * que las etiquetas de productos (`labels-printing`).
 */
export default function AssetLabelsClient({ assets, companyName, preselected }: { assets: LabelAsset[]; companyName: string; preselected: string[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselected.length > 0 ? preselected : assets.map((asset) => asset.id)));
  const [layout, setLayout] = useState<Layout>('a4-24');
  const config = LAYOUTS[layout];
  const compact = layout === 'a4-40';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? assets.filter((asset) => [asset.code, asset.name, asset.location ?? '', asset.category].some((value) => value.toLowerCase().includes(q))) : assets;
  }, [assets, query]);

  const toPrint = assets.filter((asset) => selected.has(asset.id));
  const pages: LabelAsset[][] = [];
  for (let index = 0; index < toPrint.length; index += config.perPage) pages.push(toPrint.slice(index, index + config.perPage));
  const unencodable = toPrint.filter((asset) => !isEncodable(asset.code)).length;

  function print() {
    document.documentElement.classList.add('labels-printing');
    window.print();
    document.documentElement.classList.remove('labels-printing');
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
      <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card print:hidden" aria-label="Bienes">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Código, nombre, ubicación" aria-label="Filtrar bienes" className="pl-8" />
        </div>
        <div className="flex gap-2 text-xs">
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSelected(new Set([...selected, ...filtered.map((asset) => asset.id)]))}>Marcar visibles</button>
          <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSelected(new Set())}>Desmarcar todo</button>
        </div>
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
          {filtered.map((asset) => (
            <li key={asset.id}>
              <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm hover:bg-muted/40">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(asset.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(asset.id);
                    else next.delete(asset.id);
                    setSelected(next);
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{asset.name}</span>
                  <span className="block text-xs text-muted-foreground">{asset.code}{asset.location ? ` · ${asset.location}` : ''}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <select aria-label="Formato de hoja" className={nativeSelectClass} value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
          {(Object.keys(LAYOUTS) as Layout[]).map((key) => (
            <option key={key} value={key}>{LAYOUTS[key].label}</option>
          ))}
        </select>
        {unencodable > 0 && <p className="text-xs text-warning">{unencodable} código{unencodable === 1 ? '' : 's'} con tildes o Ñ no se pueden pasar a código de barras: se imprime solo el texto.</p>}
        <Button type="button" className="w-full" disabled={toPrint.length === 0} onClick={print}>
          <Printer className="size-4" aria-hidden="true" /> Imprimir {toPrint.length} etiqueta{toPrint.length === 1 ? '' : 's'}
        </Button>
      </section>

      <section className="min-w-0 overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 print:overflow-visible print:border-0 print:bg-transparent print:p-0" aria-label="Vista previa">
        <div className="label-sheet space-y-4 print:space-y-0" data-layout={layout}>
          {pages.map((page, pageIndex) => (
            <div
              key={pageIndex}
              className="grid bg-card shadow-card print:shadow-none"
              style={{
                gridTemplateColumns: `repeat(${config.columns}, ${config.width})`,
                gridAutoRows: config.height,
                columnGap: layout === 'a4-24' ? '2.5mm' : 0,
                width: 'fit-content',
                breakAfter: pageIndex < pages.length - 1 ? 'page' : 'auto',
              }}
            >
              {page.map((asset) => (
                <div
                  key={asset.id}
                  className={cn('flex flex-col justify-between overflow-hidden border border-dashed border-border text-foreground print:border-transparent', compact ? 'px-[2mm] py-[1.5mm]' : 'px-[3mm] py-[2mm]')}
                  style={{ breakInside: 'avoid' }}
                >
                  <div>
                    <p className={cn('truncate uppercase tracking-wide text-muted-foreground', compact ? 'text-[5.5pt]' : 'text-[6.5pt]')}>{companyName} · Activo fijo</p>
                    <p className={cn('line-clamp-2 leading-tight font-semibold', compact ? 'text-[7pt]' : 'text-[8.5pt]')}>{asset.name}</p>
                  </div>
                  <div>
                    <BarcodeSvg value={asset.code} className={cn('w-full', compact ? 'h-[7mm]' : 'h-[10mm]')} />
                    <p className="flex justify-between gap-2 font-mono text-[6.5pt] leading-tight">
                      <span>{asset.code}</span>
                      {asset.location && <span className="truncate">{asset.location}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

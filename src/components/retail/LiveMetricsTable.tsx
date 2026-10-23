'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { formatDays, formatPct } from '@/lib/intelligence/format';
import { LIVE_STATUS_META, dayTimeLabel, type LiveMetricsRow, type LiveStatus } from '@/lib/retail/live-metrics';

type SortKey = 'name' | 'stock' | 'soldToday' | 'sold' | 'received' | 'sellThrough' | 'velocity' | 'coverage' | 'lastSale';
type StatusFilter = 'ALL' | LiveStatus;

const STATUS_ORDER: LiveStatus[] = ['OUT', 'LOW', 'NO_SALES', 'OK'];
const SORT_CHOICES: Array<{ key: SortKey; direction: 1 | -1; label: string }> = [
  { key: 'coverage', direction: 1, label: 'Se acaba antes' },
  { key: 'sellThrough', direction: -1, label: 'Mayor sell-through' },
  { key: 'sellThrough', direction: 1, label: 'Menor sell-through' },
  { key: 'sold', direction: -1, label: 'Más vendido' },
  { key: 'soldToday', direction: -1, label: 'Más vendido hoy' },
  { key: 'stock', direction: -1, label: 'Más stock' },
  { key: 'name', direction: 1, label: 'Nombre (A-Z)' },
];
const PAGE = 200;

const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
const rate = (value: number | null) => (value === null ? '—' : value.toLocaleString('es-CL', { maximumFractionDigits: value < 10 ? 2 : 1 }));

const lastSale = (iso: string | null): string => (iso ? dayTimeLabel(new Date(iso)) : '—');

/** `null` siempre al final, sin importar el sentido: "sin dato" no es ni mucho ni poco. */
function compareNullable(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function sortValue(row: LiveMetricsRow, key: SortKey): number | null {
  switch (key) {
    case 'stock':
      return row.stock;
    case 'soldToday':
      return row.soldToday;
    case 'sold':
      return row.sold;
    case 'received':
      return row.received;
    case 'sellThrough':
      return row.sellThroughPct;
    case 'velocity':
      return row.dailyVelocity;
    case 'coverage':
      return row.coverageDays;
    case 'lastSale':
      return row.lastSaleAt ? new Date(row.lastSaleAt).getTime() : null;
    case 'name':
      return null;
  }
}

/**
 * Tabla del panel "Retail en vivo". Ordena y filtra en el navegador sobre las
 * filas que ya calculó el servidor; al refrescarse cada minuto conserva la
 * búsqueda, el filtro y el orden elegidos.
 */
export function LiveMetricsTable({ rows, periodDays }: { rows: LiveMetricsRow[]; periodDays: number }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  // Por defecto, lo más urgente arriba: lo agotado (0 días) y lo que se agota antes.
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: 'coverage', direction: 1 });
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const result: Record<LiveStatus, number> = { OUT: 0, LOW: 0, NO_SALES: 0, OK: 0 };
    for (const row of rows) result[row.status] += 1;
    return result;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
    const filtered = rows.filter((row) => {
      if (status !== 'ALL' && row.status !== status) return false;
      if (!needle) return true;
      const haystack = `${row.name} ${row.sku} ${row.brand ?? ''} ${row.category ?? ''}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
      return haystack.includes(needle);
    });
    return filtered.sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name, 'es') * sort.direction;
      return compareNullable(sortValue(a, sort.key), sortValue(b, sort.key), sort.direction) || a.name.localeCompare(b.name, 'es');
    });
  }, [rows, query, status, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, direction: current.direction === 1 ? -1 : 1 } : { key, direction: key === 'name' || key === 'coverage' ? 1 : -1 }));

  const header = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort.key === key;
    const Icon = active ? (sort.direction === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th scope="col" className={cn('px-3 py-2 text-xs font-semibold text-muted-foreground', align === 'right' && 'text-right')} aria-sort={active ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => toggleSort(key)} className={cn('inline-flex items-center gap-1 hover:text-foreground', align === 'right' && 'flex-row-reverse')}>
          {label}
          <Icon className={cn('size-3.5', !active && 'opacity-40')} aria-hidden="true" />
        </button>
      </th>
    );
  };

  const chip = (value: StatusFilter, label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => {
        setStatus(value);
        setLimit(PAGE);
      }}
      aria-pressed={status === value}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium',
        status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'
      )}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <label className="relative min-w-0 flex-1 basis-56">
          <span className="sr-only">Buscar producto</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE);
            }}
            placeholder="Nombre, SKU, marca o categoría"
            className="h-9 w-full rounded-lg border border-border bg-card pr-3 pl-8 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {chip('ALL', 'Todos', rows.length)}
          {STATUS_ORDER.map((value) => chip(value, LIVE_STATUS_META[value].label, counts[value]))}
        </div>
        {/* En pantallas angostas no hay encabezados de columna: se ordena desde aquí. */}
        <label className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground md:hidden">
          Ordenar por
          <select
            value={`${sort.key}:${sort.direction}`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(':');
              setSort({ key: key as SortKey, direction: direction === '-1' ? -1 : 1 });
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
          >
            {SORT_CHOICES.map((choice) => (
              <option key={`${choice.key}:${choice.direction}`} value={`${choice.key}:${choice.direction}`}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Sin productos" description={rows.length === 0 ? 'Esta bodega no tiene stock ni movimientos en el período.' : 'Ningún producto calza con la búsqueda o el filtro.'} />
      ) : (
        <>
          <ul className="divide-y divide-border md:hidden" aria-label="Productos">
            {visible.slice(0, limit).map((row) => {
              const meta = LIVE_STATUS_META[row.status];
              return (
                <li key={row.productId} className="space-y-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{row.name}</p>
                      <p className="text-xs break-words text-muted-foreground">
                        <span className="font-mono">{row.sku}</span>
                        {row.category ? ` · ${row.category}` : ''}
                      </p>
                    </div>
                    <StatusBadge tone={meta.tone} className="shrink-0 whitespace-nowrap">
                      {meta.label}
                    </StatusBadge>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Stock</dt>
                      <dd className="font-medium tabular-nums">
                        {qty(row.stock)} {row.unit}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Días restantes</dt>
                      <dd className="font-medium tabular-nums">{formatDays(row.coverageDays)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sell-through</dt>
                      <dd className="font-medium tabular-nums">{formatPct(row.sellThroughPct, 0)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Vendido hoy</dt>
                      <dd className="font-medium tabular-nums">{qty(row.soldToday)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">{periodDays} días</dt>
                      <dd className="font-medium tabular-nums">{qty(row.sold)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Venta diaria</dt>
                      <dd className="font-medium tabular-nums">{rate(row.dailyVelocity)}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1080px] border-collapse text-left text-sm" data-testid="retail-live-table">
              <thead className="bg-muted">
                <tr>
                  {header('name', 'Producto', 'left')}
                  {header('stock', 'Stock')}
                  {header('soldToday', 'Vendido hoy')}
                  {header('sold', `Vendido ${periodDays} días`)}
                  {header('received', 'Entró')}
                  {header('sellThrough', 'Sell-through')}
                  {header('velocity', 'Venta diaria')}
                  {header('coverage', 'Días restantes')}
                  <th scope="col" className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Estado
                  </th>
                  {header('lastSale', 'Última venta')}
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((row) => {
                  const meta = LIVE_STATUS_META[row.status];
                  return (
                    <tr key={row.productId} className="border-t border-border align-top hover:bg-muted/60">
                      <td className="max-w-72 px-3 py-2">
                        <span className="block font-medium break-words">{row.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">{row.sku}</span>
                          {row.brand ? ` · ${row.brand}` : ''}
                          {row.category ? ` · ${row.category}` : ''}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {qty(row.stock)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{qty(row.soldToday)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{qty(row.sold)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{qty(row.received)}</td>
                      <td className="px-3 py-2 text-right">
                        {row.sellThroughPct === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex flex-col items-end gap-1">
                            <span className="tabular-nums">{formatPct(row.sellThroughPct, 0)}</span>
                            <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(row.sellThroughPct)}%` }} />
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" title={row.dailyVelocity === null ? undefined : `Medida en ${row.availableDays} ${row.availableDays === 1 ? 'día' : 'días'} con stock`}>
                        {rate(row.dailyVelocity)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatDays(row.coverageDays)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-muted-foreground">{lastSale(row.lastSaleAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {visible.length > limit && (
        <div className="flex justify-center border-t border-border p-3">
          <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted">
            Mostrar {Math.min(PAGE, visible.length - limit)} más de {visible.length - limit}
          </button>
        </div>
      )}
    </div>
  );
}

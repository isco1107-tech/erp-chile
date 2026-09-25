'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Layers, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { nativeSelectClass } from '@/components/ui/field-classes';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import type { ExpiryStatus } from '@/lib/inventory/lots';
import { listLotsAction } from '@/modules/inventory/actions/inventory-count.actions';
import type { LotFilter, LotRow } from '@/modules/inventory/services/lots.service';

const FILTERS: Array<{ value: LotFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'expired', label: 'Vencidos' },
  { value: 'soon', label: 'Por vencer' },
  { value: 'ok', label: 'Vigentes' },
];

const STATUS: Record<ExpiryStatus, { label: string; tone: Tone }> = {
  expired: { label: 'Vencido', tone: 'danger' },
  soon: { label: 'Por vencer', tone: 'warning' },
  ok: { label: 'Vigente', tone: 'success' },
  none: { label: 'Sin vencimiento', tone: 'neutral' },
};

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

function daysLabel(days: number | null): string {
  if (days === null) return '';
  if (days < 0) return `hace ${-days} ${days === -1 ? 'día' : 'días'}`;
  if (days === 0) return 'vence hoy';
  return `en ${days} ${days === 1 ? 'día' : 'días'}`;
}

interface Props {
  warehouses: { id: string; name: string }[];
  canSeeCosts: boolean;
  initialFilter: LotFilter;
}

export default function LotsClient({ warehouses, canSeeCosts, initialFilter }: Props) {
  const [filter, setFilter] = useState<LotFilter>(initialFilter);
  const [warehouseId, setWarehouseId] = useState('all');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await listLotsAction({ filter, warehouseId: warehouseId === 'all' ? undefined : warehouseId, query: query.trim() || undefined });
      if (cancelled) return;
      if (result.success) setRows(result.data);
      else toast.error(result.error);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filter, warehouseId, query]);

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Lotes">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Estado de vencimiento" className="inline-flex w-fit rounded-md bg-muted p-0.5">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', filter === item.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {warehouses.length > 1 && (
            <select aria-label="Bodega" className={cn(nativeSelectClass, 'h-9 sm:w-48')} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="all">Todas las bodegas</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Lote, producto o SKU" aria-label="Buscar lote" className="h-9 pl-8 sm:w-64" />
          </div>
        </div>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title={query ? 'Sin resultados' : filter === 'expired' ? 'No hay lotes vencidos con saldo' : filter === 'soon' ? 'Nada por vencer en los próximos días' : 'Aún no hay lotes'}
          description={
            query
              ? 'Prueba con otro lote o producto.'
              : 'Marca "Maneja lotes y vencimiento" en la ficha del producto y registra el lote al recibir la mercadería.'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-4 py-2.5 font-medium">Lote</th>
                <th className="px-4 py-2.5 font-medium">Bodega</th>
                <th className="px-4 py-2.5 font-medium">Vencimiento</th>
                <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
                {canSeeCosts && <th className="px-4 py-2.5 text-right font-medium">Valor</th>}
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={canSeeCosts ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td>
                </tr>
              )}
              {rows.map((lot) => (
                <tr key={lot.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{lot.productName}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{lot.sku}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{lot.lotNumber}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{lot.warehouseName}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {lot.expiryDate ? (
                      <>
                        {formatDate(lot.expiryDate)}
                        <span className={cn('ml-2 text-xs', lot.status === 'expired' ? 'text-danger' : lot.status === 'soon' ? 'text-warning' : 'text-muted-foreground')}>
                          {daysLabel(lot.daysToExpiry)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {lot.quantity.toLocaleString('es-CL', { maximumFractionDigits: 3 })} <span className="text-xs text-muted-foreground">{lot.unit}</span>
                  </td>
                  {canSeeCosts && <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatCurrency(lot.value)}</td>}
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={STATUS[lot.status].tone}>{STATUS[lot.status].label}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

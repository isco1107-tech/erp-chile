'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDays } from '@/lib/intelligence/format';
import { shortDay } from '@/lib/retail/heatmap';
import { REORDER_STATUS_META } from '@/lib/retail/reorder';
import { createPurchaseRequestAction } from '@/modules/purchases/actions/purchase-request.actions';
import type { ReorderRow, LeadSource } from '@/modules/retail/services/reorder.service';

const LEAD_SOURCE: Record<LeadSource, string> = { CONFIGURED: 'configurado', MEASURED: 'medido', DEFAULT: 'por defecto' };
/** Tope de ítems de una solicitud de compra (lo exige su esquema). */
const MAX_ITEMS = 100;

const qty = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 3 });
const rate = (value: number | null) => (value === null ? '—' : value.toLocaleString('es-CL', { maximumFractionDigits: value < 10 ? 1 : 0 }));

function stockout(row: ReorderRow): string {
  if (row.daysToStockout === null) return row.status === 'NO_RATE' ? '—' : 'Más de 120 días';
  if (row.daysToStockout === 0) return 'Ya no hay';
  return `${shortDay(row.stockoutDay!)} (${formatDays(row.daysToStockout)})`;
}

/**
 * Lista de reposición. Con Compras y el permiso de pedir, se marcan productos
 * y se crea un borrador de solicitud de compra con las cantidades sugeridas
 * (la acción de Compras valida permiso y productos; aquí no se compra nada).
 */
export function ReorderTable({ rows, canRequest, warehouseName, today, coverDays }: { rows: ReorderRow[]; canRequest: boolean; warehouseName: string; today: string; coverDays: number }) {
  const router = useRouter();
  const orderable = useMemo(() => rows.filter((row) => row.suggestedQty > 0), [rows]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.filter((row) => row.suggestedQty > 0 && (row.status === 'NOW' || row.status === 'SOON')).map((row) => row.productId)));
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = () =>
    startTransition(async () => {
      const chosen = orderable.filter((row) => selected.has(row.productId)).slice(0, MAX_ITEMS);
      if (chosen.length === 0) return void toast.error('Marca al menos un producto con cantidad sugerida');
      const neededBy = chosen.map((row) => row.stockoutDay).filter((day): day is string => Boolean(day)).sort()[0] ?? '';
      const result = await createPurchaseRequestAction(
        {
          title: `Reposición ${warehouseName} ${shortDay(today)}`.slice(0, 120),
          neededBy: neededBy > today ? neededBy : '',
          notes: `Generada desde Métricas de retail → Reposición predictiva: cubre el tiempo de entrega y ${coverDays} días de venta. Revisa las cantidades antes de enviarla.`,
          items: chosen.map((row) => ({ productId: row.productId, description: row.name.slice(0, 200), quantity: row.suggestedQty, unit: row.unit })),
        },
        false
      );
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Solicitud creada');
      router.push(`/dashboard/purchase-requests/${result.data.id}`);
    });

  if (rows.length === 0) {
    return <EmptyState title="Sin productos que reponer" description="Esta bodega no tiene stock ni ventas en los últimos 84 días con estos filtros." />;
  }

  const checkbox = (row: ReorderRow) =>
    canRequest && row.suggestedQty > 0 ? (
      <input type="checkbox" checked={selected.has(row.productId)} onChange={() => toggle(row.productId)} aria-label={`Pedir ${row.name}`} className="size-4 accent-primary" />
    ) : null;

  return (
    <div className="space-y-3">
      {canRequest && orderable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {selected.size} de {orderable.length} productos con cantidad sugerida marcados.
          </p>
          <button
            type="button"
            onClick={create}
            disabled={pending || selected.size === 0}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Creando…' : 'Crear solicitud de compra'}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <ul className="divide-y divide-border md:hidden" aria-label="Productos">
          {rows.map((row) => {
            const meta = REORDER_STATUS_META[row.status];
            return (
              <li key={row.productId} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {checkbox(row)}
                    <div className="min-w-0">
                      <p className="font-medium break-words">{row.name}</p>
                      <p className="text-xs break-words text-muted-foreground">
                        <span className="font-mono">{row.sku}</span>
                        {row.supplier ? ` · ${row.supplier.name}` : ''}
                      </p>
                    </div>
                  </div>
                  <StatusBadge tone={meta.tone} className="shrink-0 whitespace-nowrap">
                    {meta.label}
                  </StatusBadge>
                </div>
                <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Stock</dt>
                    <dd className="font-medium tabular-nums">{qty(row.stock)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Se agota</dt>
                    <dd className="font-medium">{stockout(row)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Pedir</dt>
                    <dd className="font-medium tabular-nums">{row.suggestedQty > 0 ? `${qty(row.suggestedQty)} ${row.unit}` : '—'}</dd>
                  </div>
                </dl>
                {row.pattern && <p className="text-xs text-muted-foreground">{row.pattern}</p>}
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1080px] text-sm" data-testid="reorder-table">
            <thead className="bg-muted text-left text-xs font-semibold text-muted-foreground">
              <tr>
                {canRequest && (
                  <th scope="col" className="w-8 px-3 py-2">
                    <span className="sr-only">Pedir</span>
                  </th>
                )}
                <th scope="col" className="px-3 py-2">Producto</th>
                <th scope="col" className="px-3 py-2 text-right">Stock</th>
                <th scope="col" className="px-3 py-2 text-right">Venta diaria</th>
                <th scope="col" className="px-3 py-2 text-right">Entrega</th>
                <th scope="col" className="px-3 py-2">Se agota</th>
                <th scope="col" className="px-3 py-2">Pedir antes del</th>
                <th scope="col" className="px-3 py-2 text-right">Cantidad sugerida</th>
                <th scope="col" className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = REORDER_STATUS_META[row.status];
                return (
                  <tr key={row.productId} className="border-t border-border align-top hover:bg-muted/60">
                    {canRequest && <td className="px-3 py-2">{checkbox(row)}</td>}
                    <td className="max-w-64 px-3 py-2">
                      <span className="block font-medium break-words">{row.name}</span>
                      <span className="block text-xs break-words text-muted-foreground">
                        <span className="font-mono">{row.sku}</span>
                        {row.supplier ? ` · ${row.supplier.name}` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {qty(row.stock)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                      {row.incoming > 0 && <span className="block text-xs text-muted-foreground">+{qty(row.incoming)} en camino</span>}
                    </td>
                    <td className="max-w-52 px-3 py-2 text-right tabular-nums">
                      {rate(row.dailyRate)}
                      {row.pattern && <span className="block text-xs text-muted-foreground">{row.pattern}</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {formatDays(row.leadDays)}
                      <span className="block text-xs text-muted-foreground">{LEAD_SOURCE[row.leadSource]}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{stockout(row)}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{row.orderBy ? (row.orderBy <= today ? 'Hoy' : shortDay(row.orderBy)) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{row.suggestedQty > 0 ? `${qty(row.suggestedQty)} ${row.unit}` : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

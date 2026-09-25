'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import type { SalesOrderStatus } from '@prisma/client';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonVariants } from '@/components/ui/button';
import type { Tone } from '@/components/ui/tone';
import { listSalesOrdersAction } from '@/modules/sales/actions/sales-orders.actions';
import type { SalesOrderListItem } from '@/modules/sales/services/sales-orders.service';
import { SALES_ORDER_STATUS_LABELS } from '@/modules/sales/orders';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';

type Filter = 'OPEN' | SalesOrderStatus | 'ALL';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'OPEN', label: 'Abiertas' },
  { value: 'COMPLETED', label: 'Concluidas' },
  { value: 'CANCELLED', label: 'Anuladas' },
  { value: 'ALL', label: 'Todas' },
];

export const ORDER_STATUS_TONE: Record<SalesOrderStatus, Tone> = {
  PENDING: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' });
}

/** Avance facturado de la nota, por monto. */
function progress(order: SalesOrderListItem): number {
  const total = order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (total <= 0) return 0;
  const done = order.items.reduce((sum, item) => sum + Math.min(item.quantity, item.quantityInvoiced) * item.unitPrice, 0);
  return Math.round((done / total) * 100);
}

export default function SalesOrdersClient({ canWrite }: { canWrite: boolean }) {
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SalesOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Momento de la última carga, para marcar entregas atrasadas sin leer el reloj al renderizar.
  const [now, setNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await listSalesOrdersAction(filter === 'ALL' ? undefined : filter, query.trim() || undefined);
      if (cancelled) return;
      if (result.success) {
        setRows(result.data);
        setNow(Date.now());
      } else toast.error(result.error);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filter, query]);

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Notas de venta">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Estado" className="inline-flex rounded-md bg-muted p-0.5">
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
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="N° de nota, cliente o RUT" aria-label="Buscar" className="h-9 pl-8 sm:w-64" />
        </div>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          title={query ? 'Sin resultados' : filter === 'OPEN' ? 'No hay notas de venta abiertas' : 'Sin notas de venta'}
          description={query ? 'Prueba con otro número, cliente o RUT.' : 'Una nota de venta registra el pedido del cliente, reserva el stock y se factura por partes.'}
          action={
            canWrite && !query ? (
              <Link href="/dashboard/sales/orders/new" className={buttonVariants({ size: 'sm' })}>
                Nueva nota de venta
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">N°</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Vendedor</th>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Entrega</th>
                <th className="px-4 py-2.5 font-medium">Facturado</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td>
                </tr>
              )}
              {rows.map((order) => {
                const late = order.deliveryDate && (order.status === 'PENDING' || order.status === 'IN_PROGRESS') && new Date(order.deliveryDate).getTime() < now;
                const pct = progress(order);
                return (
                  <tr key={order.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/sales/orders/${order.id}`} className="font-mono text-xs font-medium hover:underline">
                        #{order.folio}
                      </Link>
                    </td>
                    <td className="max-w-[260px] px-4 py-2.5">
                      <Link href={`/dashboard/sales/orders/${order.id}`} className="block truncate font-medium hover:underline">
                        {order.contact.nombreFantasia ?? order.contact.razonSocial}
                      </Link>
                      <span className="text-xs text-muted-foreground">{order.contact.rut}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{order.seller?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(order.orderDate)}</td>
                    <td className={cn('px-4 py-2.5 tabular-nums', late ? 'font-medium text-danger' : 'text-muted-foreground')}>
                      {order.deliveryDate ? formatDate(order.deliveryDate) : '—'}
                      {late && <span className="sr-only"> (atrasada)</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted" aria-hidden="true">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(order.totalAmount)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={ORDER_STATUS_TONE[order.status]}>{SALES_ORDER_STATUS_LABELS[order.status]}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

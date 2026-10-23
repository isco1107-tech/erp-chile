'use client';

import { useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/chile/tax';
import { PAYMENT_PROVIDER_INFO } from '@/lib/ecommerce/payment';
import { cn } from '@/lib/utils';
import { listStoreOrdersAction } from '@/modules/ecommerce/actions/store.actions';
import type { StoreOrdersPage, StoreStats } from '@/modules/ecommerce/services/store-orders.service';
import type { OrderListQuery } from '@/modules/ecommerce/schema';
import OrderDialog from './OrderDialog';
import { ACTION_ERROR, FULFILLMENT_BADGE, ORDER_STATUS_BADGE, PAYMENT_BADGE, formatDateTime } from './store-admin-shared';

type View = OrderListQuery['view'];

const VIEWS: Array<{ value: View; label: string; hint: string }> = [
  { value: 'all', label: 'Todos', hint: 'Todos los pedidos' },
  { value: 'to-confirm', label: 'Por confirmar pago', hint: 'Transferencias y pagos al retirar que esperan que confirmes el dinero' },
  { value: 'to-prepare', label: 'Por preparar', hint: 'Pagados (o por pagar al retirar) que todavía no empiezas a preparar' },
  { value: 'to-ship', label: 'En entrega', hint: 'Preparando, despachados o listos para retirar' },
  { value: 'attention', label: 'Requieren atención', hint: 'Una venta que no se pudo emitir, o un pago que llegó con el pedido cerrado' },
  { value: 'closed', label: 'Cerrados', hint: 'Cancelados o vencidos' },
];

export interface OrdersPanelProps {
  siteId: string;
  canWrite: boolean;
  canFulfill: boolean;
  canManage: boolean;
  onStats: (stats: StoreStats) => void;
}

export default function OrdersPanel({ siteId, canWrite, canFulfill, canManage, onStats }: OrdersPanelProps) {
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<StoreOrdersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await listStoreOrdersAction({ siteId, view, q: query.trim() || undefined, page });
        if (cancelled) return;
        if (result.success) {
          setData(result.data.page);
          onStats(result.data.stats);
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
  }, [siteId, view, query, page, reloadKey, onStats]);

  const exportHref = `/api/store/orders/export?${new URLSearchParams({ siteId, view, ...(query.trim() ? { q: query.trim() } : {}) }).toString()}`;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section aria-label="Pedidos" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((entry) => {
          const count = data?.counts[entry.value];
          return (
            <button
              key={entry.value}
              type="button"
              title={entry.hint}
              aria-pressed={view === entry.value}
              onClick={() => {
                setView(entry.value);
                setPage(1);
              }}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors', view === entry.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}
            >
              {entry.label}
              {count !== undefined && count > 0 && entry.value !== 'all' && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', view === entry.value ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por N°, nombre, correo o teléfono"
            aria-label="Buscar pedidos"
            className="pl-9"
            maxLength={100}
          />
        </div>
        <a href={exportHref} download className={buttonVariants({ variant: 'outline' })}>
          <Download className="size-4" aria-hidden="true" /> Descargar Excel
        </a>
      </div>

      {error && !data ? (
        <EmptyState title="No pudimos cargar los pedidos" description={error} actionLabel="Reintentar" onAction={() => setReloadKey((value) => value + 1)} />
      ) : loading && !data ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : data && data.rows.length === 0 ? (
        <EmptyState
          title={query || view !== 'all' ? 'No hay pedidos con ese filtro' : 'Todavía no hay pedidos'}
          description={query || view !== 'all' ? 'Prueba con otra vista o cambia la búsqueda.' : 'Cuando alguien compre en tu tienda, el pedido aparecerá acá y te avisaremos.'}
        />
      ) : (
        data && (
          <div className={cn('overflow-x-auto rounded-lg border border-border bg-card', loading && 'opacity-60')} aria-busy={loading}>
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Pedido</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Pago</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Entrega</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((row) => (
                  <tr key={row.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenId(row.id)}>
                    <td className="px-4 py-3 align-top">
                      <button type="button" className="font-semibold text-foreground underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); setOpenId(row.id); }}>
                        #{row.number}
                      </button>
                      <p className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
                      {row.attention && <p className="mt-1 max-w-56 text-xs font-medium text-danger">{row.attention}</p>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium break-words">{row.customerName}</p>
                      <p className="text-xs break-all text-muted-foreground">{row.customerEmail}</p>
                      <p className="text-xs text-muted-foreground">{row.itemCount} {row.itemCount === 1 ? 'unidad' : 'unidades'}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge tone={PAYMENT_BADGE[row.paymentStatus].tone}>{PAYMENT_BADGE[row.paymentStatus].label}</StatusBadge>
                        {row.paymentProvider && <span className="text-xs text-muted-foreground">{PAYMENT_PROVIDER_INFO[row.paymentProvider].label}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col items-start gap-1">
                        {row.status !== 'OPEN' ? <StatusBadge tone={ORDER_STATUS_BADGE[row.status].tone}>{ORDER_STATUS_BADGE[row.status].label}</StatusBadge> : <StatusBadge tone={FULFILLMENT_BADGE[row.fulfillmentStatus].tone}>{FULFILLMENT_BADGE[row.fulfillmentStatus].label}</StatusBadge>}
                        <span className="text-xs text-muted-foreground">{row.deliveryMethod === 'PICKUP' ? 'Retiro en tienda' : 'Despacho'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-top font-semibold tabular-nums">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {data && pages > 1 && (
        <nav aria-label="Páginas de pedidos" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Página {data.page} de {pages} · {data.total} pedidos
          </span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)}>
              Siguiente
            </Button>
          </span>
        </nav>
      )}

      <OrderDialog orderId={openId} onClose={() => setOpenId(null)} onChanged={() => setReloadKey((value) => value + 1)} canWrite={canWrite} canFulfill={canFulfill} canManage={canManage} />
    </section>
  );
}

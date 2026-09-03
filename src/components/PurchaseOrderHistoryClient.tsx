'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/pagination';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { listPurchaseOrdersAction } from '@/modules/purchases/actions/purchase-order.actions';
import type { PurchaseOrderListItem } from '@/modules/purchases/services/purchase-order.service';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SENT: 'bg-blue-600/10 text-blue-600',
  PARTIALLY_RECEIVED: 'bg-amber-500/10 text-amber-600',
  RECEIVED: 'bg-green-600/10 text-green-600',
  CLOSED: 'bg-secondary text-secondary-foreground',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  PARTIALLY_RECEIVED: 'Recibida parcial',
  RECEIVED: 'Recibida',
  CLOSED: 'Cerrada',
  CANCELLED: 'Anulada',
};

export default function PurchaseOrderHistoryClient() {
  const [rows, setRows] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  async function load(q?: string) {
    setLoading(true);
    const result = await listPurchaseOrdersAction(undefined, q);
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => load(query || undefined), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, totalItems } = usePaginatedList(rows);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Buscar por RUT o Razón Social"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-64"
        />
        <div className="flex gap-2">
          <Link href="/dashboard/purchases" className={buttonVariants({ variant: 'outline' })}>
            ← Compras
          </Link>
          <Link href="/dashboard/purchases/orders/new" className={buttonVariants({ variant: 'default' })}>
            Nueva Orden de Compra
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-border">
        <div className="max-h-[65vh] scroll-smooth overflow-auto">
        <table className="w-full min-w-[800px] table-auto text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 text-left backdrop-blur-sm">
            <tr>
              <th className="p-2 font-medium">Folio</th>
              <th className="p-2 font-medium">Fecha</th>
              <th className="p-2 font-medium">Proveedor</th>
              <th className="p-2 font-medium">Ítems</th>
              <th className="p-2 font-medium">Estado</th>
              <th className="p-2 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={6}>Cargando...</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title={query ? 'Sin resultados para tu búsqueda' : 'Todavía no hay órdenes de compra'}
                    description={query ? 'Prueba con otro RUT o razón social.' : 'Crea tu primera orden de compra para verla aquí.'}
                    action={
                      !query && (
                        <Link href="/dashboard/purchases/orders/new" className={buttonVariants({ size: 'sm' })}>
                          Nueva Orden de Compra
                        </Link>
                      )
                    }
                  />
                </td>
              </tr>
            )}
            {!loading && pageItems.map((order) => (
              <tr key={order.id} className="border-t border-border">
                <td className="p-2 font-mono text-xs">#{order.folio}</td>
                <td className="p-2">{new Date(order.issueDate).toLocaleDateString('es-CL')}</td>
                <td className="p-2">{order.contact.rut} — {order.contact.razonSocial}</td>
                <td className="p-2">{order._count.items}</td>
                <td className="p-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                </td>
                <td className="p-2">
                  <Link href={`/dashboard/purchases/orders/${order.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ClipboardList, Plus } from 'lucide-react';
import type { PurchaseRequestStatus } from '@prisma/client';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { cn } from '@/lib/utils';
import { listPurchaseRequestsAction } from '@/modules/purchases/actions/purchase-request.actions';
import { PURCHASE_REQUEST_STATUS_LABELS } from '@/modules/purchases/schema';
import type { PurchaseRequestRow } from '@/modules/purchases/services/purchase-request.service';

export const REQUEST_STATUS_TONE: Record<PurchaseRequestStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  ORDERED: 'success',
  CANCELLED: 'neutral',
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'OPEN', label: 'En curso' },
  { value: 'SUBMITTED', label: 'Por aprobar' },
  { value: 'APPROVED', label: 'Por cotizar' },
  { value: 'ORDERED', label: 'Con OC' },
  { value: 'ALL', label: 'Todas' },
];

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' }) : '—';
}

export default function PurchaseRequestsClient({ scopeAll }: { scopeAll: boolean }) {
  const [filter, setFilter] = useState('OPEN');
  const [rows, setRows] = useState<PurchaseRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listPurchaseRequestsAction(filter).then((result) => {
      if (cancelled) return;
      if (result.success) setRows(result.data);
      else toast.error(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Solicitudes de compra">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Estado" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
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
        <Link href="/dashboard/purchase-requests/new" className={buttonVariants()}>
          <Plus className="size-4" aria-hidden="true" /> Nueva solicitud
        </Link>
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-10 text-muted-foreground/40" aria-hidden="true" />}
          title="No hay solicitudes en esta vista"
          description={scopeAll ? 'Cuando alguien del equipo pida una compra, aparece aquí para aprobarla y cotizarla.' : 'Pide lo que necesitas: jefatura lo aprueba y compras lo cotiza con proveedores.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">N°</th>
                <th className="px-4 py-2.5 font-medium">Solicitud</th>
                <th className="px-4 py-2.5 font-medium">Para cuándo</th>
                <th className="px-4 py-2.5 text-right font-medium">Estimado</th>
                <th className="px-4 py-2.5 font-medium">Cotizaciones</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.folio}</td>
                  <td className="max-w-[320px] px-4 py-2.5">
                    <Link href={`/dashboard/purchase-requests/${row.id}`} className="font-medium hover:underline">{row.title}</Link>
                    <p className="text-xs text-muted-foreground">
                      {row.itemCount} ítem{row.itemCount === 1 ? '' : 's'} · {row.requestedByName ?? '—'} · {formatDate(row.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{formatDate(row.neededBy)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.estimatedTotal !== null ? formatCurrency(row.estimatedTotal) : '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.quoteCount > 0 ? `${row.quoteCount} proveedor${row.quoteCount === 1 ? '' : 'es'}` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge tone={REQUEST_STATUS_TONE[row.status]}>{PURCHASE_REQUEST_STATUS_LABELS[row.status]}</StatusBadge>
                    {row.orderFolios.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">OC N° {row.orderFolios.join(', ')}</p>}
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

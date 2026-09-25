'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Clock, PackageCheck, Plus, Search, Wrench, Hourglass } from 'lucide-react';
import type { ServiceTicketStatus } from '@prisma/client';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { SERVICE_STATUS_LABELS } from '@/lib/service/tickets';
import { cn } from '@/lib/utils';
import { listServiceTicketsAction } from '@/modules/service-desk/actions/service-tickets.actions';
import { SERVICE_PRIORITY_LABELS } from '@/modules/service-desk/schema';
import type { ServiceTicketRow } from '@/modules/service-desk/services/service-tickets.service';

export const SERVICE_STATUS_TONE: Record<ServiceTicketStatus, Tone> = {
  RECEIVED: 'neutral',
  DIAGNOSING: 'info',
  WAITING_APPROVAL: 'warning',
  APPROVED: 'accent',
  IN_REPAIR: 'info',
  READY: 'success',
  DELIVERED: 'neutral',
  CANCELLED: 'neutral',
};

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'OPEN', label: 'En taller' },
  { value: 'WAITING_APPROVAL', label: 'Esperando aprobación' },
  { value: 'READY', label: 'Listos para retiro' },
  { value: 'DELIVERED', label: 'Entregados' },
  { value: 'ALL', label: 'Todos' },
];

function formatDate(value: Date | string | null): string {
  return value ? new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' }) : '—';
}

export default function ServiceTicketsClient({ canWrite }: { canWrite: boolean }) {
  const [filter, setFilter] = useState('OPEN');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ServiceTicketRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  // "Hoy" se fija al cargar los datos, no al renderizar.
  const [today, setToday] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await listServiceTicketsAction(filter, query.trim() || undefined);
      if (cancelled) return;
      if (result.success) {
        setRows(result.data.rows);
        setCounts(result.data.counts);
        setToday(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }));
      } else toast.error(result.error);
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filter, query]);

  const inShop = (counts.RECEIVED ?? 0) + (counts.DIAGNOSING ?? 0) + (counts.APPROVED ?? 0) + (counts.IN_REPAIR ?? 0);
  const late = today ? rows.filter((row) => row.promisedDate && !['READY', 'DELIVERED', 'CANCELLED'].includes(row.status) && new Date(row.promisedDate).toISOString().slice(0, 10) < today).length : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="En taller" value={String(inShop)} icon={Wrench} tone="info" hint="Recibidos, en diagnóstico o reparación" />
        <KpiCard label="Esperando aprobación" value={String(counts.WAITING_APPROVAL ?? 0)} icon={Hourglass} tone={(counts.WAITING_APPROVAL ?? 0) > 0 ? 'warning' : 'neutral'} hint="Presupuestos enviados al cliente" />
        <KpiCard label="Listos para retiro" value={String(counts.READY ?? 0)} icon={PackageCheck} tone={(counts.READY ?? 0) > 0 ? 'success' : 'neutral'} hint="Avísale al cliente" />
        <KpiCard label="Atrasados" value={String(late)} icon={Clock} tone={late > 0 ? 'danger' : 'neutral'} hint="Pasada la fecha comprometida" />
      </div>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Órdenes de servicio">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
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
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="N°, cliente, equipo o serie" aria-label="Buscar orden de servicio" className="h-9 pl-8 sm:w-64" />
            </div>
            {canWrite && (
              <Link href="/dashboard/service/new" className={buttonVariants()}>
                <Plus className="size-4" aria-hidden="true" /> Recibir equipo
              </Link>
            )}
          </div>
        </div>

        {!loading && rows.length === 0 ? (
          <EmptyState
            icon={<Wrench className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title={query ? 'Sin resultados' : 'No hay órdenes en esta vista'}
            description={query ? 'Prueba con otro número, cliente o serie.' : 'Recibe un equipo: se imprime el comprobante con el enlace para que el cliente siga la reparación y apruebe el presupuesto.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">N°</th>
                  <th className="px-4 py-2.5 font-medium">Equipo</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Técnico</th>
                  <th className="px-4 py-2.5 font-medium">Recibido</th>
                  <th className="px-4 py-2.5 text-right font-medium">Presupuesto</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Cargando…</td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-mono text-xs">{row.folio}</td>
                    <td className="max-w-[260px] px-4 py-2.5">
                      <Link href={`/dashboard/service/${row.id}`} className="font-medium hover:underline">{row.equipment}</Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.brandModel ?? 'Sin marca/modelo'}
                        {row.warranty ? ' · Garantía' : ''}
                        {row.priority === 'HIGH' ? ` · ${SERVICE_PRIORITY_LABELS.HIGH}` : ''}
                      </p>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5">{row.customerName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.technicianName ?? 'Sin asignar'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {formatDate(row.createdAt)}
                      <span className="block text-xs">hace {row.daysOpen} día{row.daysOpen === 1 ? '' : 's'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.estimateTotal > 0 ? formatCurrency(row.estimateTotal) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={SERVICE_STATUS_TONE[row.status]}>{SERVICE_STATUS_LABELS[row.status]}</StatusBadge>
                      {row.promisedDate && !['DELIVERED', 'CANCELLED'].includes(row.status) && <p className="mt-0.5 text-xs text-muted-foreground">Comprometido {formatDate(row.promisedDate)}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

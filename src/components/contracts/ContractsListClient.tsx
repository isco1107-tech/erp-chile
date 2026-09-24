'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Plus, Repeat, TrendingUp } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { BILLING_FREQUENCY_LABELS } from '@/lib/services/recurring-billing';
import { CONTRACT_STATUS_LABELS } from '@/modules/contracts/schema';
import type { ContractListRow } from '@/modules/contracts/services/contracts.service';

const STATUS_TONE = { ACTIVE: 'success', PAUSED: 'warning', ENDED: 'neutral' } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function ContractsListClient({ contracts, canWrite }: { contracts: ContractListRow[]; canWrite: boolean }) {
  const [query, setQuery] = useState('');
  // Fijado al montar: el conteo de "facturan en 7 días" no debe cambiar entre renders.
  const [now] = useState(() => Date.now());

  const kpis = useMemo(() => {
    const active = contracts.filter((c) => c.status === 'ACTIVE');
    return {
      active: active.length,
      mrr: active.reduce((sum, c) => sum + c.mrr, 0),
      next7: active.filter((c) => new Date(c.nextBillingDate).getTime() - now <= 7 * DAY_MS).length,
      failed: contracts.filter((c) => c.billings[0]?.status === 'FAILED').length,
    };
  }, [contracts, now]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => c.name.toLowerCase().includes(q) || c.contact.razonSocial.toLowerCase().includes(q) || c.contact.rut.includes(q));
  }, [contracts, query]);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Contratos activos" value={String(kpis.active)} icon={Repeat} tone="accent" />
        <KpiCard label="Ingreso mensual recurrente" value={formatCurrency(kpis.mrr)} icon={TrendingUp} tone="success" />
        <KpiCard label="Facturan en 7 días" value={String(kpis.next7)} icon={CalendarClock} tone="info" />
        <KpiCard label="Con facturación fallida" value={String(kpis.failed)} icon={AlertTriangle} tone={kpis.failed > 0 ? 'danger' : 'neutral'} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input className="max-w-xs" placeholder="Buscar por contrato, cliente o RUT…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar contratos" />
        {canWrite && (
          <Link href="/dashboard/contracts/new" className={buttonVariants()}>
            <Plus aria-hidden="true" /> Nuevo contrato
          </Link>
        )}
      </div>

      {contracts.length === 0 ? (
        <EmptyState
          title="Sin contratos recurrentes todavía"
          description="Registra tus igualas, mantenciones, arriendos o suscripciones y el sistema generará la factura de cada período por ti."
          action={
            canWrite ? (
              <Link href="/dashboard/contracts/new" className={buttonVariants()}>
                Crear primer contrato
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Contrato</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Frecuencia</th>
                <th className="px-3 py-2 text-right">Neto por período</th>
                <th className="px-3 py-2">Próxima factura</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contract) => {
                const last = contract.billings[0];
                return (
                  <tr key={contract.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/contracts/${contract.id}`} className="font-medium text-foreground hover:underline">
                        {contract.name}
                      </Link>
                      {contract.autoIssue && <span className="block text-xs text-muted-foreground">Emisión automática</span>}
                    </td>
                    <td className="px-3 py-2">
                      {contract.contact.razonSocial}
                      <span className="block text-xs text-muted-foreground">{formatRut(contract.contact.rut)}</span>
                    </td>
                    <td className="px-3 py-2">{BILLING_FREQUENCY_LABELS[contract.frequency]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(contract.periodNet)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {contract.status === 'ACTIVE' ? new Date(contract.nextBillingDate).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' }) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={STATUS_TONE[contract.status]}>{CONTRACT_STATUS_LABELS[contract.status]}</StatusBadge>
                      {last?.status === 'FAILED' && (
                        <StatusBadge tone="danger" className="ml-1">
                          Falló {last.periodKey}
                        </StatusBadge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency } from '@/lib/chile/tax';
import { formatShortDate } from '@/lib/intelligence/format';
import { dealRiskFlags, isOpenStage, weightedAmount, type DealRiskFlag } from '@/lib/crm/analytics';
import { listOpportunitiesAction, type OpportunityList } from '@/modules/crm/actions/crm.actions';
import { DEAL_TYPE_LABELS, STAGE_LABELS, STALE_AFTER_DAYS } from '@/modules/crm/schema';
import type { OpportunityCard } from '@/modules/crm/services/crm.service';
import { cn } from '@/lib/utils';
import { CrmFilterBar, EMPTY_CRM_FILTERS, matchesQuery, toServerFilters, type CrmFilterState } from './CrmFilterBar';
import { PRIORITY_DOT, STAGE_TONE, partyName } from './crm-ui';
import { useOpportunityDialogs } from './useOpportunityDialogs';

type StatusView = 'open' | 'won' | 'lost' | 'all';
type SortKey = 'title' | 'amount' | 'weighted' | 'probability' | 'expectedCloseDate' | 'updatedAt';

const RISK_LABELS: Record<DealRiskFlag, string> = {
  stale: `Estancado +${STALE_AFTER_DAYS} d`,
  'no-next-step': 'Sin próximo paso',
  'close-date-passed': 'Cierre vencido',
};

function sortValue(opp: OpportunityCard, key: SortKey): number | string {
  switch (key) {
    case 'title':
      return opp.title.toLowerCase();
    case 'amount':
      return opp.amount;
    case 'weighted':
      return weightedAmount(opp);
    case 'probability':
      return opp.probability;
    case 'expectedCloseDate':
      return opp.expectedCloseDate ? new Date(opp.expectedCloseDate).getTime() : Number.MAX_SAFE_INTEGER;
    case 'updatedAt':
      return new Date(opp.updatedAt).getTime();
  }
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cn('px-3 py-2 font-medium', align === 'right' && 'text-right')} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </th>
  );
}

export function CrmListClient({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<OpportunityList | null>(null);
  const [filters, setFilters] = useState<CrmFilterState>(EMPTY_CRM_FILTERS);
  const [status, setStatus] = useState<StatusView>('open');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'expectedCloseDate', dir: 'asc' });
  const [loadedAt, setLoadedAt] = useState(0);
  const serverFilters = useMemo(() => toServerFilters(filters), [filters]);

  const load = useCallback(async () => {
    const result = await listOpportunitiesAction(serverFilters);
    if (result.success) {
      setData(result.data);
      setLoadedAt(Date.now());
    } else toast.error(result.error);
  }, [serverFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const { openNew, openDetail, dialogs } = useOpportunityDialogs({ lookups: data, canWrite, onChanged: () => void load() });

  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = data.opportunities.filter((opp) => {
      if (!matchesQuery(opp, filters.query)) return false;
      if (status === 'open') return isOpenStage(opp.stage);
      if (status === 'won') return opp.stage === 'WON';
      if (status === 'lost') return opp.stage === 'LOST';
      return true;
    });
    return [...filtered].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [data, filters.query, status, sort]);

  const totals = useMemo(
    () => ({ amount: rows.reduce((s, o) => s + o.amount, 0), weighted: rows.reduce((s, o) => s + (isOpenStage(o.stage) ? weightedAmount(o) : 0), 0), barter: rows.reduce((s, o) => s + o.barterValuation, 0) }),
    [rows]
  );

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    if (serverFilters.mine) params.set('mine', '1');
    if (serverFilters.dealType) params.set('dealType', serverFilters.dealType);
    if (serverFilters.projectId) params.set('projectId', serverFilters.projectId);
    if (serverFilters.priority) params.set('priority', serverFilters.priority);
    if (serverFilters.tag) params.set('tag', serverFilters.tag);
    const qs = params.toString();
    return `/api/crm/export${qs ? `?${qs}` : ''}`;
  }, [serverFilters]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'title' || key === 'expectedCloseDate' ? 'asc' : 'desc' }));
  }

  if (!data) return <p className="text-sm text-muted-foreground">Cargando oportunidades…</p>;

  return (
    <div className="space-y-4">
      <CrmFilterBar
        value={filters}
        onChange={setFilters}
        lookups={data}
        actions={
          <>
            <a href={exportHref} className={buttonVariants({ variant: 'outline' })}>
              <Download aria-hidden="true" />
              Exportar Excel
            </a>
            {canWrite && (
              <Button type="button" onClick={() => openNew()}>
                <Plus aria-hidden="true" />
                Nueva oportunidad
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm" role="tablist" aria-label="Estado">
          {(
            [
              ['open', 'Abiertos'],
              ['won', 'Ganados'],
              ['lost', 'Perdidos'],
              ['all', 'Todos'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              onClick={() => setStatus(value)}
              className={cn('rounded-md px-3 py-1', status === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {rows.length} negocio(s) · <span className="font-medium text-foreground tabular-nums">{formatCurrency(totals.amount)}</span> en efectivo
          {totals.barter > 0 && <> · {formatCurrency(totals.barter)} en canje</>}
          {status === 'open' && <> · {formatCurrency(totals.weighted)} ponderado</>}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState title="Sin oportunidades con estos filtros" description="Cambia los filtros o crea una nueva oportunidad." />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <SortHeader label="Oportunidad" k="title" sort={sort} onSort={toggleSort} />
                <th scope="col" className="px-3 py-2 font-medium">
                  Tipo
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Etapa
                </th>
                <SortHeader label="Monto" k="amount" align="right" sort={sort} onSort={toggleSort} />
                <SortHeader label="Prob." k="probability" align="right" sort={sort} onSort={toggleSort} />
                <SortHeader label="Ponderado" k="weighted" align="right" sort={sort} onSort={toggleSort} />
                <SortHeader label="Cierre" k="expectedCloseDate" sort={sort} onSort={toggleSort} />
                <th scope="col" className="px-3 py-2 font-medium">
                  Responsable
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Alertas
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((opp) => {
                const risks = dealRiskFlags(
                  {
                    stage: opp.stage,
                    stageChangedAt: new Date(opp.stageChangedAt),
                    expectedCloseDate: opp.expectedCloseDate ? new Date(opp.expectedCloseDate) : null,
                    hasPendingActivity: opp.activities.length > 0,
                  },
                  new Date(loadedAt),
                  STALE_AFTER_DAYS
                );
                return (
                  <tr key={opp.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40" onClick={() => openDetail(opp.id)}>
                    <td className="max-w-[320px] px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', PRIORITY_DOT[opp.priority])} aria-hidden="true" />
                        <div className="min-w-0">
                          <button type="button" className="block truncate text-left font-medium text-foreground hover:underline" onClick={(e) => { e.stopPropagation(); openDetail(opp.id); }}>
                            {opp.title}
                          </button>
                          <p className="truncate text-xs text-muted-foreground">
                            {partyName(opp)}
                            {opp.project && ` · ${opp.project.code}`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{DEAL_TYPE_LABELS[opp.dealType]}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={STAGE_TONE[opp.stage]}>{STAGE_LABELS[opp.stage]}</StatusBadge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {formatCurrency(opp.amount)}
                      {opp.isBarter && <span className="block text-[11px] font-normal text-info">+ {formatCurrency(opp.barterValuation)} canje</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{opp.probability}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{isOpenStage(opp.stage) ? formatCurrency(weightedAmount(opp)) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-muted-foreground">{opp.expectedCloseDate ? formatShortDate(opp.expectedCloseDate) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{opp.owner?.name ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {risks.map((risk) => (
                          <span key={risk} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', risk === 'close-date-passed' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                            {RISK_LABELS[risk]}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialogs}
    </div>
  );
}

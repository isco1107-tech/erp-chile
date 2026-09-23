'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlarmClock, CircleDollarSign, Clock4, Gift, Plus, Scale, Target, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/KpiCard';
import { formatCurrency } from '@/lib/chile/tax';
import { formatDays, formatPct, formatShortDate } from '@/lib/intelligence/format';
import { getPipelineBoardAction, moveOpportunityStageAction, type PipelineBoard } from '@/modules/crm/actions/crm.actions';
import { DEAL_TYPE_LABELS, OPEN_STAGES, PRIORITY_LABELS, STAGE_LABELS, STALE_AFTER_DAYS, type OpportunityStageKey } from '@/modules/crm/schema';
import type { OpportunityCard } from '@/modules/crm/services/crm.service';
import { cn } from '@/lib/utils';
import { CrmFilterBar, EMPTY_CRM_FILTERS, matchesQuery, toServerFilters, type CrmFilterState } from './CrmFilterBar';
import { PRIORITY_DOT, partyName } from './crm-ui';
import { useOpportunityDialogs } from './useOpportunityDialogs';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tablero del embudo comercial. Las tarjetas se arrastran entre etapas
 * (arrastrar y soltar nativo del navegador) y también se pueden mover desde
 * el detalle con un selector: el arrastre no es la única vía, para que el
 * tablero sea usable con teclado y en pantallas táctiles.
 */
export function CrmBoardClient({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [filters, setFilters] = useState<CrmFilterState>(EMPTY_CRM_FILTERS);
  const [dragOver, setDragOver] = useState<OpportunityStageKey | null>(null);
  // Hora de la última carga: base de "días en etapa" y de lo vencido, fijada
  // al traer los datos para que el render sea puro.
  const [loadedAt, setLoadedAt] = useState(0);

  const serverFilters = useMemo(() => toServerFilters(filters), [filters]);

  const load = useCallback(async () => {
    const result = await getPipelineBoardAction(serverFilters);
    if (result.success) {
      setBoard(result.data);
      setLoadedAt(Date.now());
    } else toast.error(result.error);
  }, [serverFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const { openNew, openDetail, dialogs } = useOpportunityDialogs({ lookups: board, canWrite, onChanged: () => void load() });

  // Accesos directos: /dashboard/crm?new=1 (paleta ⌘K) y ?open=<id> (desde otras pantallas).
  useEffect(() => {
    if (!board) return;
    const openId = searchParams.get('open');
    if (canWrite && searchParams.get('new') === '1') {
      openNew();
      router.replace('/dashboard/crm');
    } else if (openId) {
      openDetail(openId);
      router.replace('/dashboard/crm');
    }
  }, [board, canWrite, searchParams, router, openNew, openDetail]);

  const filtered = useMemo(() => (board ? board.opportunities.filter((opp) => matchesQuery(opp, filters.query)) : []), [board, filters.query]);

  async function handleDrop(stage: OpportunityStageKey, opportunityId: string) {
    setDragOver(null);
    const card = board?.opportunities.find((opp) => opp.id === opportunityId);
    if (!card || card.stage === stage) return;
    // Optimista: la tarjeta se mueve al instante; si el servidor rechaza, se recarga.
    setBoard((prev) => (prev ? { ...prev, opportunities: prev.opportunities.map((opp) => (opp.id === opportunityId ? { ...opp, stage } : opp)) } : prev));
    const result = await moveOpportunityStageAction(opportunityId, { stage });
    if (!result.success) toast.error(result.error);
    await load();
  }

  if (!board) return <p className="text-sm text-muted-foreground">Cargando embudo…</p>;
  const { summary } = board;
  const closedRecently = filtered.filter((opp) => opp.stage === 'WON' || opp.stage === 'LOST');

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Embudo abierto" value={formatCurrency(summary.openAmount)} icon={Target} tone="accent" trend={`${summary.openCount} negocios`} trendDirection="neutral" hint="en curso" />
        <KpiCard label="Pronóstico ponderado" value={formatCurrency(summary.weightedForecast)} icon={Scale} tone="info" />
        <KpiCard label="Canje en negociación" value={formatCurrency(summary.openBarter)} icon={Gift} tone="neutral" />
        <KpiCard label="Ganado este mes" value={formatCurrency(summary.wonThisMonthAmount)} icon={Trophy} tone="success" trend={`${summary.wonThisMonthCount} cierres`} trendDirection="up" hint="este mes" />
        <KpiCard label="Tasa de cierre (180 días)" value={formatPct(summary.winRatePct, 0)} icon={CircleDollarSign} tone="accent" />
        <KpiCard label="Ciclo de venta (mediana)" value={formatDays(summary.medianCycleDays)} icon={Clock4} tone="warning" />
      </section>

      {(summary.overdueActivities > 0 || summary.staleCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlarmClock className="size-4" aria-hidden="true" />
          {summary.overdueActivities > 0 && <span>{summary.overdueActivities} actividad(es) de seguimiento vencidas</span>}
          {summary.staleCount > 0 && <span>{summary.staleCount} negocio(s) sin avanzar hace más de {STALE_AFTER_DAYS} días</span>}
        </div>
      )}

      <CrmFilterBar
        value={filters}
        onChange={setFilters}
        lookups={board}
        actions={
          canWrite && (
            <Button type="button" onClick={() => openNew()} data-tutorial="module-primary-action">
              <Plus aria-hidden="true" />
              Nueva oportunidad
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {OPEN_STAGES.map((stage) => {
          const cards = filtered.filter((opp) => opp.stage === stage);
          const stageSummary = summary.byStage.find((s) => s.stage === stage);
          return (
            <section
              key={stage}
              aria-label={STAGE_LABELS[stage]}
              onDragOver={(event) => {
                if (!canWrite) return;
                event.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain');
                if (id) void handleDrop(stage, id);
              }}
              className={cn('flex min-h-[220px] flex-col rounded-lg border bg-muted/40 p-2 transition-colors', dragOver === stage ? 'border-primary bg-accent' : 'border-border')}
            >
              <header className="flex items-baseline justify-between gap-2 px-1.5 pt-1 pb-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {STAGE_LABELS[stage]} <span className="font-normal text-muted-foreground">· {cards.length}</span>
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground" title="Monto ponderado por probabilidad">
                  {formatCurrency(stageSummary?.weighted ?? 0)}
                </span>
              </header>
              <ul className="flex flex-1 flex-col gap-2">
                {cards.map((card) => (
                  <OpportunityCardItem key={card.id} card={card} now={loadedAt} draggable={canWrite} onOpen={() => openDetail(card.id)} />
                ))}
                {cards.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted-foreground">{canWrite ? 'Arrastra una oportunidad aquí' : 'Sin negocios en esta etapa'}</li>}
              </ul>
            </section>
          );
        })}
      </div>

      {closedRecently.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-semibold text-foreground">Cerrados en los últimos 90 días</h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {closedRecently.map((card) => (
              <li key={card.id}>
                <button type="button" onClick={() => openDetail(card.id)} className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{card.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {partyName(card)} · {DEAL_TYPE_LABELS[card.dealType]}
                    </span>
                  </span>
                  <span className={cn('shrink-0 text-sm font-semibold tabular-nums', card.stage === 'WON' ? 'text-success' : 'text-muted-foreground line-through')}>
                    {formatCurrency(card.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {summary.lostReasons.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">Principales motivos de pérdida: {summary.lostReasons.map((r) => `${r.reason} (${r.count})`).join(' · ')}</p>
          )}
        </section>
      )}

      {dialogs}
    </div>
  );
}

function OpportunityCardItem({ card, now, draggable, onOpen }: { card: OpportunityCard; now: number; draggable: boolean; onOpen: () => void }) {
  const next = card.activities[0];
  const nextOverdue = next?.dueAt ? new Date(next.dueAt).getTime() < now : false;
  const daysInStage = Math.floor((now - new Date(card.stageChangedAt).getTime()) / DAY_MS);
  const stale = daysInStage > STALE_AFTER_DAYS;

  return (
    <li
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', card.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={cn('rounded-md border border-border bg-card shadow-card transition-shadow hover:shadow-hover', draggable && 'cursor-grab active:cursor-grabbing')}
    >
      <button type="button" onClick={onOpen} className="block w-full p-3 text-left">
        <div className="flex items-start gap-2">
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', PRIORITY_DOT[card.priority])} title={`Prioridad ${PRIORITY_LABELS[card.priority].toLowerCase()}`} aria-hidden="true" />
          <p className="line-clamp-2 text-sm font-medium text-foreground">{card.title}</p>
        </div>
        <p className="mt-0.5 truncate pl-4 text-xs text-muted-foreground">
          {partyName(card)}
          {card.person && ` · ${card.person.fullName}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">{DEAL_TYPE_LABELS[card.dealType]}</span>
          {card.project && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{card.project.code}</span>}
          {card.package && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{card.package.name}</span>}
          {card.isBarter && <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] text-info">+ canje</span>}
          {card.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(card.amount)}</span>
          <span className="text-xs tabular-nums text-muted-foreground">{card.probability}%</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {card.owner && <span>{card.owner.name.split(' ')[0]}</span>}
          {card.expectedCloseDate && <span>· cierra {formatShortDate(card.expectedCloseDate)}</span>}
          <span className={cn(stale && 'font-medium text-warning')}>· {daysInStage} d en etapa</span>
        </div>
        {next ? (
          <p className={cn('mt-2 truncate rounded bg-muted/60 px-2 py-1 text-[11px]', nextOverdue ? 'text-danger' : 'text-muted-foreground')}>
            Próximo: {next.summary}
            {next.dueAt && ` · ${formatShortDate(next.dueAt)}`}
          </p>
        ) : (
          <p className="mt-2 rounded bg-warning-soft px-2 py-1 text-[11px] text-warning">Sin próximo paso agendado</p>
        )}
      </button>
    </li>
  );
}

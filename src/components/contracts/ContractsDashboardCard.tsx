import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, CircleAlert, CircleDashed, FileSignature } from 'lucide-react';
import { ProgressRow } from '@/components/ui/ProgressRow';
import type { ContractChecklistItem, ContractState } from '@/lib/events/contracts-checklist';
import type { ContractsOverview } from '@/modules/projects/services/contracts-overview.service';
import { cn } from '@/lib/utils';

/** Cuántos pendientes se listan en la tarjeta; el resto queda en /dashboard/contracts. */
const MAX_PENDING = 5;

function progressColor(percent: number): string {
  if (percent >= 80) return 'var(--success)';
  if (percent >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

const STATE_TEXT: Record<Exclude<ContractState, 'SIGNED'>, string> = {
  EXPIRED: 'Vencido',
  NOT_GENERATED: 'Sin generar',
  PENDING_SIGNATURE: 'Pendiente de firma',
};

function PendingIcon({ state }: { state: ContractState }) {
  if (state === 'EXPIRED') return <CircleAlert className="size-4 shrink-0 text-danger" aria-hidden="true" />;
  if (state === 'PENDING_SIGNATURE') return <CircleDashed className="size-4 shrink-0 text-warning" aria-hidden="true" />;
  if (state === 'SIGNED') return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />;
  return <Circle className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />;
}

function pendingDetail(item: ContractChecklistItem): string {
  if (item.state === 'PENDING_SIGNATURE' && item.daysPending !== null && item.daysPending > 0) {
    return `${STATE_TEXT.PENDING_SIGNATURE} · ${item.daysPending} d`;
  }
  return item.state === 'SIGNED' ? 'Firmado' : STATE_TEXT[item.state];
}

/** Tarjeta del inicio: % firmado, avance por certamen y los contratos por resolver. */
export function ContractsDashboardCard({ overview }: { overview: ContractsOverview }) {
  const { summary, byProject } = overview;
  const pending = overview.items.filter((item) => item.state !== 'SIGNED').slice(0, MAX_PENDING);
  const remaining = summary.total - summary.signed - pending.length;

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card" aria-labelledby="dashboard-contracts-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
            <FileSignature className="size-4 text-accent-foreground" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            <h3 id="dashboard-contracts-title" className="text-sm font-semibold text-foreground">
              Contratos firmados
            </h3>
            <p className="text-xs text-muted-foreground tabular-nums">
              {summary.signed} de {summary.total} firmados ({summary.signedPercent ?? 0}%)
            </p>
          </div>
        </div>
        <Link href="/dashboard/contracts" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Ver checklist <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {byProject.slice(0, 4).map((project) => (
            <ProgressRow key={project.projectId} label={project.projectName} value={project.signedPercent ?? 0} color={progressColor(project.signedPercent ?? 0)} className="[&>span:first-child]:w-36" />
          ))}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground tabular-nums">
            <span>{summary.pending} pendientes de firma</span>
            <span>{summary.notGenerated} sin generar</span>
            {summary.expired > 0 && <span className="text-danger">{summary.expired} vencidos</span>}
          </div>
        </div>

        {pending.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Todos los contratos exigibles están firmados.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60">
                  <PendingIcon state={item.state} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {item.partyName}
                    <span className="text-muted-foreground"> · {item.projectName}</span>
                  </span>
                  <span className={cn('shrink-0 text-xs', item.stale || item.state === 'EXPIRED' ? 'font-medium text-warning' : 'text-muted-foreground')}>
                    {pendingDetail(item)}
                  </span>
                </Link>
              </li>
            ))}
            {remaining > 0 && (
              <li className="px-2 text-xs text-muted-foreground">
                y {remaining} más en el <Link href="/dashboard/contracts" className="underline underline-offset-2 hover:text-foreground">checklist</Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

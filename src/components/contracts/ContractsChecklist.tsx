'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Circle, CircleAlert, CircleDashed, Copy, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import type { ContractChecklistItem, ContractKind, ContractState } from '@/lib/events/contracts-checklist';
import { cn } from '@/lib/utils';

const STATE_BADGE: Record<ContractState, { label: string; tone: Tone }> = {
  SIGNED: { label: 'Firmado', tone: 'success' },
  PENDING_SIGNATURE: { label: 'Pendiente de firma', tone: 'warning' },
  NOT_GENERATED: { label: 'Sin generar', tone: 'neutral' },
  EXPIRED: { label: 'Vencido', tone: 'danger' },
};

const KIND_LABEL: Record<ContractKind, string> = {
  CANDIDATE_IMAGE: 'Contrato de imagen',
  SPONSOR_AGREEMENT: 'Carta de compromiso',
};

type StateFilter = 'todo' | 'open' | 'signed';

const STATE_FILTERS: Array<{ value: StateFilter; label: string }> = [
  { value: 'todo', label: 'Todos' },
  { value: 'open', label: 'Por resolver' },
  { value: 'signed', label: 'Firmados' },
];

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function StateIcon({ state }: { state: ContractState }) {
  const common = 'size-5 shrink-0';
  if (state === 'SIGNED') return <CheckCircle2 className={cn(common, 'text-success')} aria-hidden="true" />;
  if (state === 'EXPIRED') return <CircleAlert className={cn(common, 'text-danger')} aria-hidden="true" />;
  if (state === 'PENDING_SIGNATURE') return <CircleDashed className={cn(common, 'text-warning')} aria-hidden="true" />;
  return <Circle className={cn(common, 'text-muted-foreground/60')} aria-hidden="true" />;
}

/** Qué fecha contar en la fila, según el estado. */
function dateLine(item: ContractChecklistItem): string {
  if (item.state === 'SIGNED') return `Firmado el ${formatDate(item.signedAt) ?? '—'}`;
  if (item.state === 'EXPIRED') return `Venció el ${formatDate(item.expiresAt) ?? '—'}`;
  if (item.state === 'PENDING_SIGNATURE') {
    if (item.daysPending === null) return 'Enviado a firma';
    return item.daysPending === 0 ? 'Enviado hoy' : `Esperando firma hace ${item.daysPending} día${item.daysPending === 1 ? '' : 's'}`;
  }
  return 'Aún no se genera el contrato';
}

export default function ContractsChecklist({
  items,
  projects,
  showKind,
}: {
  items: ContractChecklistItem[];
  projects: Array<{ id: string; name: string }>;
  /** Solo si la empresa ve ambos tipos: si no, la columna sobra. */
  showKind: boolean;
}) {
  const [stateFilter, setStateFilter] = useState<StateFilter>('open');
  const [projectId, setProjectId] = useState('');
  const [kind, setKind] = useState<ContractKind | ''>('');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({ todo: items.length, open: items.filter((i) => i.state !== 'SIGNED').length, signed: items.filter((i) => i.state === 'SIGNED').length }),
    [items]
  );

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    return items.filter((item) => {
      if (stateFilter === 'open' && item.state === 'SIGNED') return false;
      if (stateFilter === 'signed' && item.state !== 'SIGNED') return false;
      if (projectId && item.projectId !== projectId) return false;
      if (kind && item.kind !== kind) return false;
      if (needle && !normalize(`${item.partyName} ${item.partyDetail ?? ''} ${item.projectName}`).includes(needle)) return false;
      return true;
    });
  }, [items, stateFilter, projectId, kind, query]);

  async function copySignUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link de firma copiado');
    } catch {
      toast.error('No se pudo copiar el link. Ábrelo desde la ficha del contrato.');
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card shadow-card" aria-labelledby="contracts-checklist-title">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h2 id="contracts-checklist-title" className="text-sm font-semibold text-foreground">
            Checklist
          </h2>
          <div role="tablist" aria-label="Filtrar por estado" className="inline-flex rounded-md bg-muted p-0.5">
            {STATE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={stateFilter === filter.value}
                onClick={() => setStateFilter(filter.value)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors',
                  stateFilter === filter.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {filter.label} <span className="tabular-nums opacity-70">{counts[filter.value]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar candidata o marca" aria-label="Buscar" className="h-9 pl-8 sm:w-56" />
          </div>
          {projects.length > 1 && (
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Certamen" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos los certámenes</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
          {showKind && (
            <select value={kind} onChange={(e) => setKind(e.target.value as ContractKind | '')} aria-label="Tipo de contrato" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos los tipos</option>
              <option value="CANDIDATE_IMAGE">Contratos de imagen</option>
              <option value="SPONSOR_AGREEMENT">Cartas de compromiso</option>
            </select>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={stateFilter === 'open' && counts.open === 0 ? 'Todo firmado' : 'Sin resultados'}
          description={stateFilter === 'open' && counts.open === 0 ? 'No queda ningún contrato por resolver.' : 'Prueba con otro filtro o búsqueda.'}
        />
      ) : (
        <ul className="divide-y divide-border">
          {visible.map((item) => (
            <li key={item.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <StateIcon state={item.state} />
                <div className="min-w-0">
                  <Link href={item.href} className="block truncate text-sm font-medium text-foreground hover:underline">
                    {item.partyName}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {[showKind ? KIND_LABEL[item.kind] : null, item.partyDetail, item.projectName].filter(Boolean).join(' · ')}
                    {item.amount !== null ? ` · ${formatCurrency(item.amount)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 pl-8 sm:pl-0">
                <span className={cn('text-xs tabular-nums', item.stale ? 'font-medium text-warning' : 'text-muted-foreground')}>{dateLine(item)}</span>
                <StatusBadge tone={STATE_BADGE[item.state].tone}>{STATE_BADGE[item.state].label}</StatusBadge>
                {item.signUrl && (
                  <button
                    type="button"
                    onClick={() => copySignUrl(item.signUrl!)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Copiar link de firma para reenviarlo"
                  >
                    <Copy className="size-3.5" aria-hidden="true" /> Link
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

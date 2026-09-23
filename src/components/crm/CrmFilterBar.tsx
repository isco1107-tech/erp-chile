'use client';

import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { nativeSelectClass } from '@/components/ui/field-classes';
import type { CrmLookups } from '@/modules/crm/actions/crm.actions';
import { DEAL_TYPE_LABELS, DEAL_TYPES, PRIORITIES, PRIORITY_LABELS, type DealTypeKey, type PriorityKey, type PipelineFilters } from '@/modules/crm/schema';
import { cn } from '@/lib/utils';

export interface CrmFilterState {
  query: string;
  mine: boolean;
  dealType: DealTypeKey | '';
  projectId: string;
  priority: PriorityKey | '';
  tag: string;
}

export const EMPTY_CRM_FILTERS: CrmFilterState = { query: '', mine: false, dealType: '', projectId: '', priority: '', tag: '' };

/** Lo que filtra el servidor (la búsqueda de texto es local, sobre lo ya cargado). */
export function toServerFilters(state: CrmFilterState): PipelineFilters {
  return {
    mine: state.mine || undefined,
    dealType: state.dealType || undefined,
    projectId: state.projectId || undefined,
    priority: state.priority || undefined,
    tag: state.tag || undefined,
  };
}

export function matchesQuery(
  opp: { title: string; prospectName: string | null; contact: { razonSocial: string } | null; owner: { name: string } | null; person: { fullName: string } | null; project: { name: string; code: string } | null; tags: string[] },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [opp.title, opp.contact?.razonSocial, opp.prospectName, opp.owner?.name, opp.person?.fullName, opp.project?.name, opp.project?.code, ...opp.tags].some((text) =>
    text?.toLowerCase().includes(q)
  );
}

export function CrmFilterBar({
  value,
  onChange,
  lookups,
  actions,
}: {
  value: CrmFilterState;
  onChange: (next: CrmFilterState) => void;
  lookups: CrmLookups | null;
  actions?: ReactNode;
}) {
  const set = <K extends keyof CrmFilterState>(key: K, v: CrmFilterState[K]) => onChange({ ...value, [key]: v });
  const active = value.dealType || value.projectId || value.priority || value.tag;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={value.query} onChange={(e) => set('query', e.target.value)} placeholder="Buscar negocio, marca, persona…" className="pl-8" aria-label="Buscar oportunidades" />
      </div>
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
        {[
          { v: false, label: 'Todo el equipo' },
          { v: true, label: 'Mis negocios' },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => set('mine', option.v)}
            className={cn('rounded-md px-3 py-1', value.mine === option.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {option.label}
          </button>
        ))}
      </div>
      <select aria-label="Tipo de negocio" className={cn(nativeSelectClass, 'w-auto')} value={value.dealType} onChange={(e) => set('dealType', e.target.value as DealTypeKey | '')}>
        <option value="">Todo tipo de negocio</option>
        {DEAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {DEAL_TYPE_LABELS[type]}
          </option>
        ))}
      </select>
      {lookups && lookups.projects.length > 0 && (
        <select aria-label="Certamen" className={cn(nativeSelectClass, 'w-auto max-w-[14rem]')} value={value.projectId} onChange={(e) => set('projectId', e.target.value)}>
          <option value="">Todos los certámenes</option>
          {lookups.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <select aria-label="Prioridad" className={cn(nativeSelectClass, 'w-auto')} value={value.priority} onChange={(e) => set('priority', e.target.value as PriorityKey | '')}>
        <option value="">Toda prioridad</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            Prioridad {PRIORITY_LABELS[p].toLowerCase()}
          </option>
        ))}
      </select>
      {lookups && lookups.tags.length > 0 && (
        <select aria-label="Etiqueta" className={cn(nativeSelectClass, 'w-auto')} value={value.tag} onChange={(e) => set('tag', e.target.value)}>
          <option value="">Toda etiqueta</option>
          {lookups.tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      {active && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_CRM_FILTERS, query: value.query, mine: value.mine })}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
          Limpiar filtros
        </button>
      )}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

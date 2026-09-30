'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, ClipboardList, Scale, TimerOff } from 'lucide-react';
import { KpiCard } from '@/components/ui/KpiCard';
import { cn } from '@/lib/utils';
import { getTasksOverviewAction } from '@/modules/tasks/actions/tasks.actions';
import type { TasksOverview } from '@/modules/tasks/services/tasks.service';
import TasksPanel from './TasksPanel';
import DelegationPanel from './DelegationPanel';

type Tab = 'MINE' | 'ALL' | 'DONE' | 'DELEGATION';

export default function TasksClient({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<Tab>('MINE');
  const [overview, setOverview] = useState<TasksOverview | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    void getTasksOverviewAction().then((result) => {
      if (active && result.success) setOverview(result.data);
    });
    return () => {
      active = false;
    };
  }, [version]);

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'MINE', label: 'Mis tareas' },
    { value: 'ALL', label: canManage ? 'Todo el equipo' : 'Creadas por mí' },
    { value: 'DONE', label: 'Cerradas' },
    { value: 'DELEGATION', label: 'Delegación' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Mis tareas abiertas" value={overview ? String(overview.mine) : '—'} icon={ClipboardList} tone="info" hint="Asignadas a mí" />
        <KpiCard label={canManage ? 'Vencidas en el equipo' : 'Mis vencidas'} value={overview ? String(overview.overdueTotal ?? overview.mineOverdue) : '—'} icon={TimerOff} tone={(overview?.overdueTotal ?? overview?.mineOverdue ?? 0) > 0 ? 'danger' : 'neutral'} hint="Pasaron su fecha y siguen abiertas" />
        <KpiCard label="Hechas (7 días)" value={overview ? String(overview.doneLast7d) : '—'} icon={CheckCheck} tone="success" hint="Cerradas esta semana" />
        <KpiCard label="Decisiones delegadas" value={overview ? String(overview.delegatedDecisions) : '—'} icon={Scale} tone={overview && overview.delegatedDecisions >= 3 ? 'success' : 'accent'} hint="Meta inicial: 3 decisiones cotidianas" />
      </div>

      <div role="tablist" aria-label="Secciones de tareas" className="inline-flex flex-wrap rounded-md bg-muted p-0.5">
        {tabs.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', tab === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'DELEGATION' ? <DelegationPanel canManage={canManage} onChanged={refresh} /> : <TasksPanel key={tab} scope={tab} canManage={canManage} onChanged={refresh} />}
    </div>
  );
}

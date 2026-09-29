'use client';

import { Check, ChevronRight, Circle } from 'lucide-react';
import type { ReadinessItem, ReadinessReport } from '@/lib/web-sites/readiness';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import type { EditorTab } from './editor-shared';

/** Pestaña donde se arregla cada ítem de "qué le falta", cuando es evidente. */
export function readinessTarget(id: string, mode: 'GUIDED' | 'HTML'): EditorTab | null {
  if (id === 'theme') return 'design';
  if (id === 'seo-title' || id === 'seo-description' || id === 'logo') return 'settings';
  if (id === 'images' || id === 'alt') return mode === 'GUIDED' ? 'content' : null;
  if (id.startsWith('html-') || id.startsWith('must-') || ['hero', 'contact', 'links', 'sample', 'empty'].includes(id)) return 'content';
  return null;
}

interface ReadinessPanelProps {
  report: ReadinessReport;
  mode: 'GUIDED' | 'HTML';
  onGo: (tab: EditorTab) => void;
}

function ItemRow({ item, mode, onGo }: { item: ReadinessItem; mode: 'GUIDED' | 'HTML'; onGo: (tab: EditorTab) => void }) {
  const target = !item.ok ? readinessTarget(item.id, mode) : null;
  const body = (
    <>
      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', item.ok ? 'bg-success-soft text-success' : item.required ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
        {item.ok ? <Check className="size-3" aria-hidden="true" /> : <Circle className="size-3" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {item.label}
          <span className="sr-only">{item.ok ? ' (listo)' : item.required ? ' (falta, obligatorio)' : ' (falta, recomendado)'}</span>
        </span>
        <span className="block text-xs text-muted-foreground">{item.hint}</span>
      </span>
      {target ? <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );
  if (target) {
    return (
      <li>
        <button type="button" onClick={() => onGo(target)} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
          {body}
        </button>
      </li>
    );
  }
  return <li className="flex items-start gap-3 px-3 py-2.5">{body}</li>;
}

function Group({ title, description, items, mode, onGo }: { title: string; description: string; items: ReadinessItem[]; mode: 'GUIDED' | 'HTML'; onGo: (tab: EditorTab) => void }) {
  if (items.length === 0) return null;
  const pending = items.filter((item) => !item.ok).length;
  return (
    <section aria-label={title} className="rounded-lg border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <StatusBadge tone={pending === 0 ? 'success' : 'warning'}>{pending === 0 ? 'Todo listo' : `${pending} pendiente${pending === 1 ? '' : 's'}`}</StatusBadge>
      </div>
      <ul className="divide-y divide-border p-1">
        {/* Pendientes primero: es lo que hay que hacer. */}
        {[...items.filter((item) => !item.ok), ...items.filter((item) => item.ok)].map((item) => (
          <ItemRow key={item.id} item={item} mode={mode} onGo={onGo} />
        ))}
      </ul>
    </section>
  );
}

/** "Qué le falta a mi sitio": progreso, obligatorios para publicar y recomendaciones. */
export function ReadinessPanel({ report, mode, onGo }: ReadinessPanelProps) {
  const required = report.items.filter((item) => item.required);
  const recommended = report.items.filter((item) => !item.required);
  return (
    <div className="space-y-4">
      <section aria-label="Avance" className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">{report.canPublish ? 'Tu sitio está listo para publicar' : `Faltan ${report.blockers} cosa${report.blockers === 1 ? '' : 's'} obligatoria${report.blockers === 1 ? '' : 's'} para publicar`}</p>
            <p className="text-xs text-muted-foreground">{report.canPublish ? 'Las recomendaciones de abajo mejoran cómo se ve y cómo te encuentran, pero no impiden publicar.' : 'Toca un ítem pendiente para ir a arreglarlo.'}</p>
          </div>
          <span className="text-2xl font-semibold tabular-nums">{report.score}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avance del sitio" aria-valuemin={0} aria-valuemax={100} aria-valuenow={report.score}>
          <div className={cn('h-full rounded-full transition-all', report.canPublish ? 'bg-success' : 'bg-warning')} style={{ width: `${report.score}%` }} />
        </div>
      </section>
      <Group title="Obligatorio para publicar" description="Sin esto el sitio no se puede publicar." items={required} mode={mode} onGo={onGo} />
      <Group title="Recomendado" description="No es obligatorio, pero hace la diferencia." items={recommended} mode={mode} onGo={onGo} />
    </div>
  );
}

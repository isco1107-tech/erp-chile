'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import { cn } from '@/lib/utils';
import {
  acknowledgeProcedureAction,
  getProcedureAction,
  installStarterPackAction,
  listProceduresAction,
  markProcedureReviewedAction,
  saveProcedureAction,
  setProcedureStatusAction,
} from '@/modules/quality/actions/quality.actions';
import { PROCEDURE_CATEGORIES, PROCEDURE_CATEGORY_LABELS, PROCEDURE_STATUS_LABELS } from '@/modules/quality/schema';
import type { ProcedureRow } from '@/modules/quality/services/quality.service';

type Category = (typeof PROCEDURE_CATEGORIES)[number];
interface Editing { id: string | null; title: string; category: Category; summary: string; content: string; reviewEveryDays: string }
interface Reader { id: string; title: string; content: string; summary: string | null; version: number }

const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

export default function ProceduresPanel({ canManage }: { canManage: boolean }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<ProcedureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [reader, setReader] = useState<Reader | null>(null);

  const load = useCallback(async () => {
    const result = await listProceduresAction();
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<{ success: true; message?: string } | { success: false; error: string }>): Promise<boolean> {
    setBusy(key);
    try {
      const result = await action();
      if (!result.success) {
        toast.error(result.error);
        return false;
      }
      if (result.message) toast.success(result.message);
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function open(id: string, mode: 'read' | 'edit') {
    setBusy(`open-${id}`);
    try {
      const result = await getProcedureAction(id);
      if (!result.success) return void toast.error(result.error);
      const p = result.data;
      if (mode === 'read') {
        setEditing(null);
        setReader({ id: p.id, title: p.title, content: p.content, summary: p.summary, version: p.version });
      } else {
        setReader(null);
        setEditing({ id: p.id, title: p.title, category: p.category as Category, summary: p.summary ?? '', content: p.content, reviewEveryDays: p.reviewEveryDays ? String(p.reviewEveryDays) : '' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const ok = await run('save', () =>
      saveProcedureAction(editing.id, { title: editing.title, category: editing.category, summary: editing.summary.trim() || undefined, content: editing.content, reviewEveryDays: editing.reviewEveryDays ? Number(editing.reviewEveryDays) : null })
    );
    if (ok) setEditing(null);
  }

  async function archive(row: ProcedureRow) {
    if (!(await confirm({ title: `¿Archivar "${row.title}"?`, description: 'Deja de mostrarse al equipo. Los acuses de lectura se conservan.', confirmLabel: 'Archivar', destructive: true }))) return;
    await run(`archive-${row.id}`, () => setProcedureStatusAction(row.id, 'ARCHIVED'));
  }

  const current = reader ? rows.find((r) => r.id === reader.id) : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">Cómo se hacen las cosas aquí, escrito una vez. Una persona nueva los lee y confirma, y el dueño deja de ser la única fuente.</p>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy === 'starter'} onClick={() => run('starter', installStarterPackAction)}>
              <Sparkles aria-hidden="true" /> Cargar paquete inicial
            </Button>
            <Button size="sm" onClick={() => { setReader(null); setEditing({ id: null, title: '', category: 'OPERACION', summary: '', content: '', reviewEveryDays: '' }); }}>
              <Plus aria-hidden="true" /> Nuevo procedimiento
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editing.id ? 'Editar procedimiento' : 'Nuevo procedimiento'}</h3>
            <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={() => setEditing(null)}><X aria-hidden="true" /></Button>
          </div>
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">Si editas un procedimiento vigente, sube de versión y el equipo debe leerlo de nuevo.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Título<Input required maxLength={120} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Categoría
              <select className={fieldClass} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as Category })}>
                {PROCEDURE_CATEGORIES.map((c) => <option key={c} value={c}>{PROCEDURE_CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium">Resumen (opcional)<Input maxLength={200} value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} /></label>
          <label className="block space-y-1 text-sm font-medium">Pasos
            <textarea required rows={10} maxLength={8000} className={fieldClass} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            <span className="block text-xs font-normal text-muted-foreground">Escribe un paso por línea, numerados (1. 2. 3.).</span>
          </label>
          <label className="block space-y-1 text-sm font-medium sm:w-1/2">Revisarlo cada (días, opcional)<Input type="number" min={7} max={730} value={editing.reviewEveryDays} onChange={(e) => setEditing({ ...editing, reviewEveryDays: e.target.value })} /></label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy === 'save'}>Guardar</Button>
          </div>
        </form>
      )}

      {reader && (
        <section aria-label={reader.title} className="space-y-3 rounded-lg border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{reader.title} <span className="text-xs font-normal text-muted-foreground">v{reader.version}</span></h3>
              {reader.summary && <p className="text-sm text-muted-foreground">{reader.summary}</p>}
            </div>
            <Button variant="ghost" size="icon" aria-label="Cerrar lectura" onClick={() => setReader(null)}><X aria-hidden="true" /></Button>
          </div>
          <div className="rounded-md bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-line">{reader.content}</div>
          {current?.status === 'ACTIVE' &&
            (current.acknowledged ? (
              <p className="inline-flex items-center gap-1 text-sm font-medium text-success"><CheckCircle2 className="size-4" aria-hidden="true" /> Ya lo leíste y confirmaste</p>
            ) : (
              <Button disabled={busy === `ack-${reader.id}`} onClick={() => run(`ack-${reader.id}`, () => acknowledgeProcedureAction(reader.id))}>
                <CheckCircle2 aria-hidden="true" /> Leí y entendí
              </Button>
            ))}
        </section>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Aún no hay procedimientos" description={canManage ? 'Parte con el paquete inicial (recepción de fruta, elaboración, higiene, despacho, reclamos, cierre semanal e inducción) y ajústalo a tu forma de trabajar.' : 'Cuando el administrador publique procedimientos, los verás aquí.'} />
      ) : (
        PROCEDURE_CATEGORIES.map((category) => {
          const list = rows.filter((r) => r.category === category);
          if (list.length === 0) return null;
          return (
            <section key={category} aria-label={PROCEDURE_CATEGORY_LABELS[category]} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{PROCEDURE_CATEGORY_LABELS[category]}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((row) => (
                  <article key={row.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>{PROCEDURE_STATUS_LABELS[row.status]}</StatusBadge>
                        <span className="text-xs text-muted-foreground">v{row.version}</span>
                        {row.reviewDue && <StatusBadge tone="warning">Revisión pendiente</StatusBadge>}
                      </div>
                      <h4 className="text-sm font-semibold">{row.title}</h4>
                      {row.summary && <p className="text-xs text-muted-foreground">{row.summary}</p>}
                      {row.status === 'ACTIVE' && (
                        <p className={cn('text-xs', row.acknowledged ? 'text-success' : 'text-muted-foreground')}>
                          {row.readCount}/{row.teamCount} leyeron{row.acknowledged ? ' · tú ya lo leíste' : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={row.status === 'ACTIVE' && !row.acknowledged ? 'default' : 'outline'} disabled={busy === `open-${row.id}`} onClick={() => open(row.id, 'read')}>Leer</Button>
                      {canManage && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => open(row.id, 'edit')}>Editar</Button>
                          {row.status === 'DRAFT' && <Button size="sm" onClick={() => run(`pub-${row.id}`, () => setProcedureStatusAction(row.id, 'ACTIVE'))}>Publicar</Button>}
                          {row.status === 'ACTIVE' && <Button size="sm" variant="outline" onClick={() => run(`rev-${row.id}`, () => markProcedureReviewedAction(row.id))}>Marcar revisado</Button>}
                          <Button size="sm" variant="ghost" onClick={() => archive(row)}>Archivar</Button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

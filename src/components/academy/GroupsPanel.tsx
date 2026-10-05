'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { listGroupsAction, saveGroupAction, setGroupActiveAction } from '@/modules/academy/actions/academy.actions';
import type { GroupRow } from '@/modules/academy/services/academy.service';

interface Draft { id: string | null; name: string; schedule: string; monthlyFee: string }

export default function GroupsPanel({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const result = await listGroupsAction();
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    const fee = draft.monthlyFee.trim();
    const result = await saveGroupAction(draft.id, { name: draft.name, schedule: draft.schedule, monthlyFee: fee === '' ? null : Number(fee) });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Guardado');
    setDraft(null);
    await load();
  }

  async function toggle(row: GroupRow) {
    const result = await setGroupActiveAction(row.id, !row.isActive);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Listo');
    await load();
  }

  return (
    <div className="space-y-4">
      {canManage && !draft && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDraft({ id: null, name: '', schedule: '', monthlyFee: '' })}><Plus aria-hidden="true" /> Nuevo grupo</Button>
        </div>
      )}
      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{draft.id ? 'Editar grupo' : 'Nuevo grupo'}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">Nombre<Input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Horario (opcional)<Input maxLength={120} placeholder="Sábados 10:00–12:00" value={draft.schedule} onChange={(e) => setDraft({ ...draft, schedule: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Mensualidad en pesos (opcional)<Input type="number" min={0} step={1} value={draft.monthlyFee} onChange={(e) => setDraft({ ...draft, monthlyFee: e.target.value })} /></label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Guardar grupo</Button>
          </div>
        </form>
      )}
      <section className="rounded-lg border border-border bg-card" aria-label="Grupos">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Aún no hay grupos" description="Crea un grupo (por ejemplo «Modelaje juvenil») para organizar a las alumnas y pasar lista." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{[row.schedule, row.monthlyFee !== null ? `Mensualidad $${row.monthlyFee.toLocaleString('es-CL')}` : null, `${row.students} alumnas`].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!row.isActive && <StatusBadge tone="neutral">Inactivo</StatusBadge>}
                  {canManage && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setDraft({ id: row.id, name: row.name, schedule: row.schedule ?? '', monthlyFee: row.monthlyFee !== null ? String(row.monthlyFee) : '' })}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(row)}>{row.isActive ? 'Desactivar' : 'Reactivar'}</Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { listTemplatesAction, saveTemplateAction } from '@/modules/quality/actions/quality.actions';
import { INSPECTION_KINDS, INSPECTION_KIND_LABELS } from '@/modules/quality/schema';
import type { TemplateRow } from '@/modules/quality/services/quality.service';

type Kind = (typeof INSPECTION_KINDS)[number];
interface ParamDraft { key: string; name: string; type: 'NUMBER' | 'CHECK'; unit: string; min: string; max: string; required: boolean }
interface Draft { id: string | null; name: string; kind: Kind; isActive: boolean; parameters: ParamDraft[] }
const fieldClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

/** Identificador estable a partir del nombre ("Grados Brix" → "grados_brix"), sin repetir los ya usados. */
function makeKey(name: string, used: Set<string>): string {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34) || 'parametro';
  let key = base.length < 2 ? `${base}_x` : base;
  for (let i = 2; used.has(key); i += 1) key = `${base}_${i}`;
  return key;
}

const emptyParam = (): ParamDraft => ({ key: '', name: '', type: 'NUMBER', unit: '', min: '', max: '', required: true });
const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export default function TemplatesPanel({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const result = await listTemplatesAction();
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function edit(t: TemplateRow) {
    setDraft({ id: t.id, name: t.name, kind: t.kind, isActive: t.isActive, parameters: t.parameters.map((p) => ({ key: p.key, name: p.name, type: p.type, unit: p.unit ?? '', min: p.min == null ? '' : String(p.min), max: p.max == null ? '' : String(p.max), required: p.required })) });
  }

  function patch(index: number, change: Partial<ParamDraft>) {
    setDraft((d) => (d ? { ...d, parameters: d.parameters.map((p, i) => (i === index ? { ...p, ...change } : p)) } : d));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const used = new Set(draft.parameters.filter((p) => p.key).map((p) => p.key));
    const parameters = draft.parameters.map((p) => {
      const key = p.key || makeKey(p.name, used);
      used.add(key);
      return { key, name: p.name.trim(), type: p.type, unit: p.unit.trim() || undefined, min: p.type === 'NUMBER' ? num(p.min) : null, max: p.type === 'NUMBER' ? num(p.max) : null, required: p.required };
    });
    setSaving(true);
    try {
      const result = await saveTemplateAction(draft.id, { name: draft.name, kind: draft.kind, isActive: draft.isActive, parameters });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Plantilla guardada');
      setDraft(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">Qué se revisa en cada tipo de inspección. Fija el mínimo y el máximo de cada medición según la resolución sanitaria de tu producto: fuera de rango, la inspección no aprueba.</p>
        {canManage && !draft && (
          <Button size="sm" onClick={() => setDraft({ id: null, name: '', kind: 'FINISHED', isActive: true, parameters: [emptyParam()] })}>
            <Plus aria-hidden="true" /> Nueva plantilla
          </Button>
        )}
      </div>

      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm font-medium sm:col-span-2">Nombre<Input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Momento
              <select className={`${fieldClass} w-full`} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })}>
                {INSPECTION_KINDS.map((k) => <option key={k} value={k}>{INSPECTION_KIND_LABELS[k]}</option>)}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            {draft.parameters.map((p, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto_auto]">
                <label className="col-span-2 space-y-1 text-xs font-medium sm:col-span-1">Qué se revisa<Input required maxLength={80} value={p.name} onChange={(e) => patch(i, { name: e.target.value })} /></label>
                <label className="space-y-1 text-xs font-medium">Tipo
                  <select className={`${fieldClass} w-full`} value={p.type} onChange={(e) => patch(i, { type: e.target.value as 'NUMBER' | 'CHECK' })}>
                    <option value="NUMBER">Medición</option>
                    <option value="CHECK">Cumple / no cumple</option>
                  </select>
                </label>
                {p.type === 'NUMBER' ? (
                  <>
                    <label className="space-y-1 text-xs font-medium">Unidad<Input maxLength={12} value={p.unit} onChange={(e) => patch(i, { unit: e.target.value })} /></label>
                    <label className="space-y-1 text-xs font-medium">Mínimo<Input type="number" step="any" value={p.min} onChange={(e) => patch(i, { min: e.target.value })} /></label>
                    <label className="space-y-1 text-xs font-medium">Máximo<Input type="number" step="any" value={p.max} onChange={(e) => patch(i, { max: e.target.value })} /></label>
                  </>
                ) : (
                  <span className="col-span-3 hidden sm:block" />
                )}
                <label className="flex items-center gap-1.5 pb-2 text-xs"><input type="checkbox" checked={p.required} onChange={(e) => patch(i, { required: e.target.checked })} /> Obligatorio</label>
                <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${p.name || 'parámetro'}`} disabled={draft.parameters.length === 1} onClick={() => setDraft({ ...draft, parameters: draft.parameters.filter((_, idx) => idx !== i) })}><Trash2 aria-hidden="true" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled={draft.parameters.length >= 30} onClick={() => setDraft({ ...draft, parameters: [...draft.parameters, emptyParam()] })}><Plus aria-hidden="true" /> Agregar parámetro</Button>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Plantilla activa (aparece al registrar inspecciones)</label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Guardar plantilla</Button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Plantillas">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Aún no hay plantillas"
            description={canManage ? 'Una plantilla define qué se mide en cada inspección. Crea la primera, o carga el paquete inicial desde la pestaña Procedimientos.' : 'Cuando el administrador cree plantillas de inspección, las verás aquí.'}
            actionLabel={canManage && !draft ? 'Nueva plantilla' : undefined}
            onAction={canManage && !draft ? () => setDraft({ id: null, name: '', kind: 'FINISHED', isActive: true, parameters: [emptyParam()] }) : undefined}
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t.name} {!t.isActive && <StatusBadge tone="neutral">Desactivada</StatusBadge>}</p>
                  <p className="text-xs text-muted-foreground">{INSPECTION_KIND_LABELS[t.kind]} · {t.parameters.length} parámetros · {t.parameters.filter((p) => p.type === 'NUMBER' && p.min == null && p.max == null).length} mediciones sin rango</p>
                </div>
                {canManage && <Button size="sm" variant="outline" onClick={() => edit(t)}>Editar</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

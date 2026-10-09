'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { evaluateInspection, type MeasuredValue, type QualityParameter } from '@/lib/quality/inspection';
import { createInspectionAction, listInspectionsAction, listSuppliersAction, listTemplatesAction } from '@/modules/quality/actions/quality.actions';
import { INSPECTION_KIND_LABELS } from '@/modules/quality/schema';
import type { InspectionRow, SupplierRow, TemplateRow } from '@/modules/quality/services/quality.service';

type Filter = 'ALL' | 'PASSED' | 'FAILED';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PASSED', label: 'Aprobadas' },
  { value: 'FAILED', label: 'No aprobadas' },
];
const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

function rangeHint(p: QualityParameter): string | null {
  const unit = p.unit ? ` ${p.unit}` : '';
  if (p.min != null && p.max != null) return `rango ${p.min.toLocaleString('es-CL')}–${p.max.toLocaleString('es-CL')}${unit}`;
  if (p.min != null) return `mínimo ${p.min.toLocaleString('es-CL')}${unit}`;
  if (p.max != null) return `máximo ${p.max.toLocaleString('es-CL')}${unit}`;
  return null;
}

export default function InspectionsPanel({ canWrite }: { canWrite: boolean }) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [contactId, setContactId] = useState('');
  const [lot, setLot] = useState('');
  const [notes, setNotes] = useState('');
  const [corrective, setCorrective] = useState('');
  const [values, setValues] = useState<Record<string, MeasuredValue>>({});

  const load = useCallback(async () => {
    const [t, s, i] = await Promise.all([listTemplatesAction(), listSuppliersAction(), listInspectionsAction(filter === 'ALL' ? undefined : filter)]);
    if (t.success) setTemplates(t.data.filter((x) => x.isActive));
    if (s.success) setSuppliers(s.data);
    if (i.success) setRows(i.data);
    else toast.error(i.error);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const template = templates.find((t) => t.id === templateId);
  const preview = useMemo(() => (template ? evaluateInspection(template.parameters, values) : null), [template, values]);

  function reset() {
    setOpen(false);
    setTemplateId('');
    setContactId('');
    setLot('');
    setNotes('');
    setCorrective('');
    setValues({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!template) return;
    setSaving(true);
    try {
      const result = await createInspectionAction({
        templateId: template.id,
        contactId: template.kind === 'INCOMING' && contactId ? contactId : undefined,
        lotNumber: lot.trim() || undefined,
        values,
        notes: notes.trim() || undefined,
        correctiveAction: corrective.trim() || undefined,
      });
      if (!result.success) return void toast.error(result.error);
      if (result.data.status === 'PASSED') toast.success(result.message ?? 'Inspección aprobada');
      else toast.warning(result.message ?? 'Inspección no aprobada');
      reset();
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filtro de inspecciones" className="inline-flex rounded-md bg-muted p-0.5">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)} className={cn('rounded px-3 py-1 text-xs font-medium transition-colors', filter === f.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {f.label}
            </button>
          ))}
        </div>
        {canWrite && !open && <Button size="sm" onClick={() => setOpen(true)} disabled={templates.length === 0}>Nueva inspección</Button>}
      </div>
      {canWrite && templates.length === 0 && !loading && <p className="text-xs text-muted-foreground">Primero crea una plantilla (pestaña Plantillas) o carga el paquete inicial en Procedimientos.</p>}

      {open && canWrite && (
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Nueva inspección</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">Plantilla
              <select required className={fieldClass} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setValues({}); }}>
                <option value="">Elegir…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {template?.kind === 'INCOMING' && (
              <label className="space-y-1 text-sm font-medium">Productor o proveedor
                <select className={fieldClass} value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">Sin indicar</option>
                  {suppliers.map((s) => <option key={s.contactId} value={s.contactId}>{s.name}</option>)}
                </select>
              </label>
            )}
            <label className="space-y-1 text-sm font-medium">N° de lote (opcional)<Input maxLength={60} value={lot} onChange={(e) => setLot(e.target.value)} /></label>
          </div>

          {template && (
            <div className="grid gap-3 sm:grid-cols-2">
              {template.parameters.map((p) => {
                const hint = rangeHint(p);
                const current = values[p.key];
                return (
                  <div key={p.key} className="space-y-1.5 rounded-md border border-border p-3">
                    <p className="text-sm font-medium">{p.name}{p.required && ' *'} {hint && <span className="text-xs font-normal text-muted-foreground">({hint})</span>}</p>
                    {p.type === 'NUMBER' ? (
                      <div className="flex items-center gap-2">
                        <Input type="number" step="any" aria-label={p.name} value={typeof current === 'number' ? String(current) : ''} onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value === '' ? null : Number(e.target.value) }))} />
                        {p.unit && <span className="text-xs text-muted-foreground">{p.unit}</span>}
                      </div>
                    ) : (
                      <div role="radiogroup" aria-label={p.name} className="flex gap-2">
                        {[{ v: true, t: 'Cumple' }, { v: false, t: 'No cumple' }].map((o) => (
                          <button key={o.t} type="button" role="radio" aria-checked={current === o.v} onClick={() => setValues((v) => ({ ...v, [p.key]: o.v }))} className={cn('flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors', current === o.v ? (o.v ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger') : 'border-input hover:bg-muted')}>
                            {o.t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {preview && (
            <p role="status" className={cn('rounded-md p-3 text-sm font-medium', preview.status === 'PASSED' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger')}>
              {preview.status === 'PASSED' ? 'Aprobaría' : `No aprobaría: ${preview.results.filter((r) => !r.ok).map((r) => (r.reason ? `${r.name} (${r.reason})` : r.name)).join('; ')}`}
              {preview.missing.length > 0 && <span className="block font-normal text-muted-foreground">Falta completar: {preview.missing.join(', ')}</span>}
            </p>
          )}
          {preview?.status === 'FAILED' && (
            <label className="block space-y-1 text-sm font-medium">Acción correctiva: ¿qué harás con este lote? *
              <textarea required rows={2} maxLength={1000} className={fieldClass} value={corrective} onChange={(e) => setCorrective(e.target.value)} />
            </label>
          )}
          <label className="block space-y-1 text-sm font-medium">Observaciones (opcional)<textarea rows={2} maxLength={1000} className={fieldClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>
            <Button type="submit" disabled={saving || !template || (preview?.missing.length ?? 0) > 0}>Guardar inspección</Button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Historial de inspecciones">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin inspecciones"
            description={
              templates.length === 0
                ? 'Cada lote que revises queda registrado aquí. Para empezar necesitas una plantilla: créala en la pestaña Plantillas o carga el paquete inicial en Procedimientos.'
                : 'Cada lote que revises queda registrado aquí, con quién lo entregó y qué se hizo si no aprobó.'
            }
            actionLabel={canWrite && !open && templates.length > 0 ? 'Nueva inspección' : undefined}
            onAction={canWrite && !open && templates.length > 0 ? () => setOpen(true) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Inspección</th>
                  <th className="px-4 py-2.5 font-medium">Lote</th>
                  <th className="px-4 py-2.5 font-medium">Productor / producto</th>
                  <th className="px-4 py-2.5 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(r.inspectedAt)}</td>
                    <td className="px-4 py-2.5"><span className="font-medium">{r.templateName}</span><span className="block text-xs text-muted-foreground">{INSPECTION_KIND_LABELS[r.kind]}</span></td>
                    <td className="px-4 py-2.5">{r.lotNumber ?? '—'}</td>
                    <td className="px-4 py-2.5">{r.supplierName ?? r.productName ?? '—'}</td>
                    <td className="px-4 py-2.5 space-y-1">
                      <StatusBadge tone={r.status === 'PASSED' ? 'success' : 'danger'}>{r.status === 'PASSED' ? 'Aprobada' : 'No aprobada'}</StatusBadge>
                      {r.status === 'FAILED' && (
                        <p className="text-xs text-muted-foreground">Falló: {r.failedParameters.join(', ')}{r.correctiveAction ? ` · Acción: ${r.correctiveAction}` : ''}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

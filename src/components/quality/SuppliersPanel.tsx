'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { listSuppliersAction, saveSupplierProfileAction } from '@/modules/quality/actions/quality.actions';
import { SUPPLIER_TYPES, SUPPLIER_TYPE_LABELS } from '@/modules/quality/schema';
import type { SupplierRow } from '@/modules/quality/services/quality.service';

type SupplierType = (typeof SUPPLIER_TYPES)[number];
interface Editing { contactId: string; name: string; supplierType: SupplierType; suppliedProducts: string; certifications: string; isLocalProducer: boolean; isActive: boolean; notes: string }
const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

function scoreTone(rate: number): 'success' | 'warning' | 'danger' {
  return rate >= 90 ? 'success' : rate >= 70 ? 'warning' : 'danger';
}

export default function SuppliersPanel({ canWrite }: { canWrite: boolean }) {
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const result = await listSuppliersAction();
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const result = await saveSupplierProfileAction({
        contactId: editing.contactId,
        supplierType: editing.supplierType,
        suppliedProducts: editing.suppliedProducts.trim() || undefined,
        certifications: editing.certifications.trim() || undefined,
        isLocalProducer: editing.isLocalProducer,
        isActive: editing.isActive,
        notes: editing.notes.trim() || undefined,
      });
      if (!result.success) return void toast.error(result.error);
      toast.success(result.message ?? 'Ficha guardada');
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const visible = rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">Tus productores y proveedores clave, con qué te entregan y cuántos de sus lotes aprobaron la inspección de recepción. Se toman de Clientes &amp; Proveedores (contactos marcados como proveedor).</p>
        <div className="flex items-center gap-2">
          <Input aria-label="Buscar productor" placeholder="Buscar…" className="h-8 w-44" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Link href="/dashboard/contacts" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>Agregar contacto</Link>
        </div>
      </div>

      {editing && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Ficha de {editing.name}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">Tipo
              <select className={fieldClass} value={editing.supplierType} onChange={(e) => setEditing({ ...editing, supplierType: e.target.value as SupplierType })}>
                {SUPPLIER_TYPES.map((t) => <option key={t} value={t}>{SUPPLIER_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">Qué nos entrega<Input maxLength={300} placeholder="Ej: manzana, frambuesa, mora" value={editing.suppliedProducts} onChange={(e) => setEditing({ ...editing, suppliedProducts: e.target.value })} /></label>
          </div>
          <label className="block space-y-1 text-sm font-medium">Certificaciones o autorizaciones vigentes<Input maxLength={300} value={editing.certifications} onChange={(e) => setEditing({ ...editing, certifications: e.target.value })} /></label>
          <label className="block space-y-1 text-sm font-medium">Notas<textarea rows={2} maxLength={1000} className={fieldClass} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></label>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.isLocalProducer} onChange={(e) => setEditing({ ...editing, isLocalProducer: e.target.checked })} /> Productor local</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Activo</label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>Guardar ficha</Button>
          </div>
        </form>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Productores y proveedores">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : visible.length === 0 ? (
          <EmptyState title="Sin productores ni proveedores" description="Crea contactos y márcalos como proveedor en Clientes & Proveedores; aparecerán aquí para completar su ficha." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Productor / proveedor</th>
                  <th className="px-4 py-2.5 font-medium">Entrega</th>
                  <th className="px-4 py-2.5 font-medium">Lotes aprobados</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr key={r.contactId}>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.name}</span> {!r.isActive && <StatusBadge tone="neutral">Inactivo</StatusBadge>}
                      <span className="block text-xs text-muted-foreground">{[r.supplierType ? SUPPLIER_TYPE_LABELS[r.supplierType as SupplierType] : 'Sin ficha', r.comuna].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.suppliedProducts ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {r.score ? <StatusBadge tone={scoreTone(r.score.passRate)}>{r.score.passRate}% · {r.score.passed}/{r.score.total}</StatusBadge> : <span className="text-xs text-muted-foreground">Sin inspecciones</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canWrite && (
                        <Button size="sm" variant="outline" onClick={() => setEditing({ contactId: r.contactId, name: r.name, supplierType: (r.supplierType as SupplierType) ?? 'PRODUCTOR', suppliedProducts: r.suppliedProducts ?? '', certifications: r.certifications ?? '', isLocalProducer: r.isLocalProducer, isActive: r.isActive, notes: r.notes ?? '' })}>
                          {r.hasProfile ? 'Editar ficha' : 'Completar ficha'}
                        </Button>
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

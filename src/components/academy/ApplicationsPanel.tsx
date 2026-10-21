'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import {
  approveApplicationAction,
  listApplicationsAction,
  listGroupsAction,
  regenerateEnrollmentLinkAction,
  rejectApplicationAction,
  shareEnrollmentLinkAction,
} from '@/modules/academy/actions/academy.actions';
import type { ApplicationRow } from '@/modules/academy/services/academy-enrollment.service';
import type { GroupRow } from '@/modules/academy/services/academy.service';
import { currentPeriod, fieldClass } from './shared';

interface Review {
  groupId: string;
  startMonth: string;
}

export default function ApplicationsPanel({ canWrite, canManage, onChanged }: { canWrite: boolean; canManage: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [pending, setPending] = useState<ApplicationRow[]>([]);
  const [reviewed, setReviewed] = useState<ApplicationRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, r, g] = await Promise.all([listApplicationsAction('PENDING'), listApplicationsAction('REVIEWED'), listGroupsAction()]);
    if (p.success) setPending(p.data);
    else toast.error(p.error);
    if (r.success) setReviewed(r.data);
    if (g.success) setGroups(g.data.filter((x) => x.isActive));
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function showLink() {
    setBusy('link');
    const result = await shareEnrollmentLinkAction();
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    setLink(result.data);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el link y cópialo a mano');
    }
  }

  async function regenerate() {
    if (!(await confirm({ title: '¿Generar un link nuevo?', description: 'El link anterior dejará de funcionar para quien ya lo tenga. Tendrás que compartir el nuevo.', confirmLabel: 'Generar link nuevo' }))) return;
    setBusy('link');
    const result = await regenerateEnrollmentLinkAction();
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Link nuevo generado');
    setLink(result.data);
  }

  const reviewOf = (row: ApplicationRow): Review => reviews[row.id] ?? { groupId: row.preferredGroupId ?? '', startMonth: currentPeriod() };

  async function approve(row: ApplicationRow) {
    const review = reviewOf(row);
    setBusy(row.id);
    const result = await approveApplicationAction(row.id, { groupId: review.groupId || null, startMonth: review.startMonth });
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Aprobada');
    await load();
    onChanged();
  }

  async function reject(row: ApplicationRow) {
    if (!(await confirm({ title: `¿Rechazar la inscripción de ${row.fullName}?`, description: 'No se crea ninguna ficha. Puedes verla después en el historial.', confirmLabel: 'Rechazar' }))) return;
    setBusy(row.id);
    const result = await rejectApplicationAction(row.id);
    setBusy(null);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Rechazada');
    await load();
    onChanged();
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Link de inscripción">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Link de inscripción</h3>
              <p className="text-xs text-muted-foreground">Compártelo por WhatsApp, Instagram o tu sitio web. Las inscripciones llegan aquí para que las revises.</p>
            </div>
            <Button size="sm" variant="outline" disabled={busy === 'link'} onClick={showLink}>
              <Link2 aria-hidden="true" /> {link ? 'Actualizar' : 'Ver link de inscripción'}
            </Button>
          </div>
          {link && (
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly aria-label="Link de inscripción" value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1" />
              <Button size="sm" onClick={() => void copy(link)}>
                <Copy aria-hidden="true" /> Copiar
              </Button>
              {canManage && (
                <Button size="sm" variant="ghost" disabled={busy === 'link'} onClick={regenerate}>
                  Generar link nuevo
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Inscripciones por revisar">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : pending.length === 0 ? (
          <EmptyState title="No hay inscripciones por revisar" description="Cuando alguien se inscriba desde el link, aparecerá aquí y te llegará un aviso a la campanita." />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((row) => {
              const review = reviewOf(row);
              return (
                <li key={row.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{row.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.rut} · Nació el {new Date(`${row.birthDate}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {row.guardianName && <StatusBadge tone="info">Menor de edad</StatusBadge>}
                      <StatusBadge tone={row.photoConsent ? 'success' : 'neutral'}>{row.photoConsent ? 'Autoriza imagen' : 'No autoriza imagen'}</StatusBadge>
                    </div>
                  </div>
                  <dl className="grid gap-2 text-sm sm:grid-cols-3">
                    <div><dt className="text-xs text-muted-foreground">Contacto</dt><dd>{[row.phone, row.email].filter(Boolean).join(' · ')}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Apoderado</dt><dd>{row.guardianName ? [row.guardianName, row.guardianPhone, row.guardianEmail].filter(Boolean).join(' · ') : '—'}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Grupo de interés</dt><dd>{row.preferredGroupName ?? 'Aún no lo sabe'}</dd></div>
                  </dl>
                  {row.message && <p className="text-sm text-muted-foreground">«{row.message}»</p>}
                  {canWrite && (
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="space-y-1 text-xs font-medium">Grupo
                        <select className={fieldClass} value={review.groupId} onChange={(e) => setReviews({ ...reviews, [row.id]: { ...review, groupId: e.target.value } })}>
                          <option value="">Sin grupo por ahora</option>
                          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-medium">Primer mes de cobro
                        <Input type="month" value={review.startMonth} onChange={(e) => setReviews({ ...reviews, [row.id]: { ...review, startMonth: e.target.value } })} />
                      </label>
                      <Button size="sm" disabled={busy === row.id || !review.startMonth} onClick={() => void approve(row)}>Aprobar</Button>
                      <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void reject(row)}>Rechazar</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4" aria-label="Historial de inscripciones">
          <h3 className="mb-2 text-sm font-semibold">Revisadas</h3>
          <ul className="space-y-1 text-sm">
            {reviewed.slice(0, 20).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">{row.fullName}</span>
                <StatusBadge tone={row.status === 'APPROVED' ? 'success' : 'neutral'}>{row.status === 'APPROVED' ? 'Aprobada' : 'Rechazada'}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

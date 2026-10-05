'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RutInput } from '@/components/ui/RutInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/components/ui/confirm-provider';
import { ATTENDANCE_LABELS } from '@/lib/academy/billing';
import { getStudentAction, listGroupsAction, listStudentsAction, saveStudentAction, setStudentActiveAction } from '@/modules/academy/actions/academy.actions';
import type { GroupRow, StudentDetail, StudentRow } from '@/modules/academy/services/academy.service';
import { currentPeriod, fieldClass, periodLabel } from './shared';

interface Draft {
  id: string | null;
  rut: string;
  fullName: string;
  groupId: string;
  birthDate: string;
  email: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  photoConsent: boolean;
  notes: string;
  startMonth: string;
}

const emptyDraft = (): Draft => ({ id: null, rut: '', fullName: '', groupId: '', birthDate: '', email: '', phone: '', guardianName: '', guardianPhone: '', guardianEmail: '', photoConsent: false, notes: '', startMonth: currentPeriod() });

function toDraft(s: StudentDetail): Draft {
  return { id: s.id, rut: s.rut, fullName: s.fullName, groupId: s.groupId ?? '', birthDate: s.birthDate ?? '', email: s.email ?? '', phone: s.phone ?? '', guardianName: s.guardianName ?? '', guardianPhone: s.guardianPhone ?? '', guardianEmail: s.guardianEmail ?? '', photoConsent: s.photoConsent, notes: s.notes ?? '', startMonth: s.startMonth };
}

export default function StudentsPanel({ canWrite, canManage }: { canWrite: boolean; canManage: boolean }) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);

  useEffect(() => {
    void listGroupsAction().then((result) => {
      if (result.success) setGroups(result.data.filter((g) => g.isActive));
    });
  }, []);

  const load = useCallback(async () => {
    const result = await listStudentsAction({ groupId: groupId || undefined, search, includeInactive: showInactive });
    if (result.success) setRows(result.data);
    else toast.error(result.error);
    setLoading(false);
  }, [groupId, search, showInactive]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function openDetail(id: string) {
    const result = await getStudentAction(id);
    if (!result.success) return void toast.error(result.error);
    setDetail(result.data);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    const result = await saveStudentAction(draft.id, {
      rut: draft.rut,
      fullName: draft.fullName,
      groupId: draft.groupId || null,
      birthDate: draft.birthDate || null,
      email: draft.email,
      phone: draft.phone,
      guardianName: draft.guardianName,
      guardianPhone: draft.guardianPhone,
      guardianEmail: draft.guardianEmail,
      photoConsent: draft.photoConsent,
      notes: draft.notes,
      startMonth: draft.startMonth,
    });
    setBusy(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Guardado');
    setDraft(null);
    setDetail(null);
    await load();
  }

  async function toggleActive(student: StudentDetail) {
    if (student.isActive && !(await confirm({ title: `¿Dar de baja a ${student.fullName}?`, description: 'Deja de aparecer en las listas y mensualidades. Su historial se conserva y puedes reactivarla.', confirmLabel: 'Dar de baja' }))) return;
    const result = await setStudentActiveAction(student.id, !student.isActive);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Listo');
    setDetail(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm font-medium">Buscar<Input placeholder="Nombre o RUT" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label className="space-y-1 text-sm font-medium">Grupo
            <select className={fieldClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Todos</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Ver dadas de baja</label>
        </div>
        {canWrite && !draft && <Button size="sm" onClick={() => { setDetail(null); setDraft(emptyDraft()); }}><Plus aria-hidden="true" /> Nueva alumna</Button>}
      </div>

      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">{draft.id ? 'Editar ficha' : 'Nueva alumna'}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-sm font-medium">Nombre completo<Input required maxLength={120} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">RUT<RutInput value={draft.rut} onChange={(rut) => setDraft({ ...draft, rut })} /></label>
            <label className="space-y-1 text-sm font-medium">Fecha de nacimiento<Input type="date" value={draft.birthDate} onChange={(e) => setDraft({ ...draft, birthDate: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Teléfono<Input maxLength={30} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Correo<Input type="email" maxLength={120} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
            <label className="space-y-1 text-sm font-medium">Grupo
              <select className={fieldClass} value={draft.groupId} onChange={(e) => setDraft({ ...draft, groupId: e.target.value })}>
                <option value="">Sin grupo</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">Primer mes de cobro<Input required type="month" value={draft.startMonth} onChange={(e) => setDraft({ ...draft, startMonth: e.target.value })} /></label>
          </div>
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Apoderado (si es menor de edad)</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1 text-sm font-medium">Nombre<Input maxLength={120} value={draft.guardianName} onChange={(e) => setDraft({ ...draft, guardianName: e.target.value })} /></label>
              <label className="space-y-1 text-sm font-medium">Teléfono<Input maxLength={30} value={draft.guardianPhone} onChange={(e) => setDraft({ ...draft, guardianPhone: e.target.value })} /></label>
              <label className="space-y-1 text-sm font-medium">Correo<Input type="email" maxLength={120} value={draft.guardianEmail} onChange={(e) => setDraft({ ...draft, guardianEmail: e.target.value })} /></label>
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.photoConsent} onChange={(e) => setDraft({ ...draft, photoConsent: e.target.checked })} /> Autoriza el uso de su imagen (fotos y videos)</label>
          <label className="block space-y-1 text-sm font-medium">Observaciones (opcional)<textarea rows={2} maxLength={1000} className={fieldClass} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Guardar ficha</Button>
          </div>
        </form>
      )}

      {detail && !draft && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-label={`Ficha de ${detail.fullName}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">{detail.fullName}</h3>
              <p className="text-xs text-muted-foreground">{detail.rut}{detail.birthDate ? ` · Nació el ${new Date(`${detail.birthDate}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canWrite && <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(detail))}>Editar ficha</Button>}
              {canManage && <Button size="sm" variant="ghost" onClick={() => toggleActive(detail)}>{detail.isActive ? 'Dar de baja' : 'Reactivar'}</Button>}
              <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>Cerrar</Button>
            </div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Contacto</dt><dd>{[detail.phone, detail.email].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Apoderado</dt><dd>{detail.guardianName ? [detail.guardianName, detail.guardianPhone, detail.guardianEmail].filter(Boolean).join(' · ') : '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Autorización de imagen</dt><dd>{detail.photoConsent ? 'Sí' : 'No'}</dd></div>
          </dl>
          {detail.notes && <p className="text-sm text-muted-foreground">{detail.notes}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Mensualidades</h4>
              {detail.pending.length === 0 ? <StatusBadge tone="success">Al día</StatusBadge> : (
                <div className="flex flex-wrap gap-1.5">{detail.pending.map((p) => <StatusBadge key={p} tone="danger">{periodLabel(p)}</StatusBadge>)}</div>
              )}
              {detail.paidPeriods.length > 0 && <p className="text-xs text-muted-foreground">Pagadas: {detail.paidPeriods.map((p) => periodLabel(p.period)).join(', ')}</p>}
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Asistencia{detail.attendanceRate !== null ? ` · ${detail.attendanceRate}%` : ''}</h4>
              {detail.recentAttendance.length === 0 ? <p className="text-xs text-muted-foreground">Aún no hay clases registradas.</p> : (
                <ul className="space-y-0.5 text-xs">
                  {detail.recentAttendance.slice(0, 8).map((a) => <li key={a.date} className="flex justify-between gap-3"><span>{new Date(`${a.date}T12:00:00Z`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</span><span className="text-muted-foreground">{ATTENDANCE_LABELS[a.status]}</span></li>)}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border bg-card" aria-label="Alumnas">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Aún no hay alumnas" description="Crea la ficha de la primera alumna con «Nueva alumna»." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => void openDetail(row.id)} className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.fullName}</p>
                    <p className="text-xs text-muted-foreground">{[row.rut, row.groupName, row.guardianName ? `Apoderado: ${row.guardianName}` : null].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!row.isActive && <StatusBadge tone="neutral">De baja</StatusBadge>}
                    {row.pendingMonths > 0 && <StatusBadge tone="danger">Debe {row.pendingMonths} {row.pendingMonths === 1 ? 'mes' : 'meses'}</StatusBadge>}
                    {row.absenceStreak >= 2 && <StatusBadge tone="warning">{row.absenceStreak} ausencias seguidas</StatusBadge>}
                    {row.attendanceRate !== null && <StatusBadge tone="neutral">Asistencia {row.attendanceRate}%</StatusBadge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

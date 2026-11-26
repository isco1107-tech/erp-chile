'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Clock, FileCheck2, QrCode, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { ATTENDANCE_LABELS, ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/academy/billing';
import { getAttendanceSheetAction, saveAttendanceAction } from '@/modules/academy/actions/academy.actions';
import type { AttendanceSheetRow } from '@/modules/academy/services/academy.service';
import CheckInQrPanel from './CheckInQrPanel';
import { todayIso } from './shared';

const ACTIVE_TONE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-success-soft text-success border-success',
  LATE: 'bg-warning-soft text-warning border-warning',
  ABSENT: 'bg-danger-soft text-danger border-danger',
  JUSTIFIED: 'bg-info-soft text-info border-info',
};

const STATUS_ICON = { PRESENT: Check, LATE: Clock, ABSENT: X, JUSTIFIED: FileCheck2 } as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** Cada cuánto se relee la lista mientras el QR recibe asistencia. */
const LIVE_REFRESH_MS = 5000;

type Baseline = Record<string, AttendanceStatus | null>;

function baselineOf(rows: readonly AttendanceSheetRow[]): Baseline {
  return Object.fromEntries(rows.map((r) => [r.studentId, r.status]));
}

interface AttendanceSheetProps {
  groupId: string;
  /** Para el QR en pantalla completa. */
  groupName?: string;
  /** "YYYY-MM-DD". */
  date: string;
  canWrite: boolean;
  /** Si viene, la lista se muestra pero no se puede editar, y se explica por qué. */
  lockedReason?: string;
  /** Se llama tras guardar la lista (para refrescar el calendario). */
  onSaved?: () => void;
  /** Avisa si hay marcas sin guardar (para no cerrar el diálogo por error). */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Lista de asistencia de un grupo en un día: una fila por alumna activa con
 * cuatro botones grandes. La usan la pestaña "Pasar lista" y cada clase del
 * calendario, así que las dos guardan exactamente lo mismo.
 *
 * Guardar envía SOLO las marcas que cambió esta persona: así no borra las que
 * llegaron entretanto por el QR (ni las de otra profesora). Con el QR abierto
 * la lista se relee sola y conserva lo que se está editando.
 */
export default function AttendanceSheet({ groupId, groupName, date, canWrite, lockedReason, onSaved, onDirtyChange }: AttendanceSheetProps) {
  const [sheet, setSheet] = useState<{ rows: AttendanceSheetRow[]; baseline: Baseline }>({ rows: [], baseline: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [live, setLive] = useState(false);
  const notifyDirty = useRef(onDirtyChange);
  useEffect(() => {
    notifyDirty.current = onDirtyChange;
  }, [onDirtyChange]);

  const { rows, baseline } = sheet;
  const changed = rows.filter((r) => r.status !== (baseline[r.studentId] ?? null));
  const dirty = changed.length > 0;
  useEffect(() => {
    notifyDirty.current?.(dirty);
  }, [dirty]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getAttendanceSheetAction(groupId, date);
    setLoading(false);
    if (!result.success) return void toast.error(result.error);
    setSheet({ rows: result.data, baseline: baselineOf(result.data) });
  }, [groupId, date]);
  useEffect(() => {
    void load();
  }, [load]);

  // Mientras el QR recibe asistencia: releer y mezclar sin pisar lo que se está editando.
  useEffect(() => {
    if (!live) return;
    let active = true;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void getAttendanceSheetAction(groupId, date).then((result) => {
        if (!active || !result.success) return;
        setSheet((current) => {
          const mine = new Map(current.rows.map((r) => [r.studentId, r]));
          const nextRows = result.data.map((server) => {
            const local = mine.get(server.studentId);
            const edited = local !== undefined && local.status !== (current.baseline[server.studentId] ?? null);
            return edited ? { ...server, status: local.status } : server;
          });
          return { rows: nextRows, baseline: baselineOf(result.data) };
        });
      });
    }, LIVE_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [live, groupId, date]);

  const editable = canWrite && !lockedReason;

  function mark(studentId: string, status: AttendanceStatus | null) {
    setSheet((current) => ({ ...current, rows: current.rows.map((r) => (r.studentId === studentId ? { ...r, status } : r)) }));
  }

  function markAll(status: AttendanceStatus | null) {
    setSheet((current) => ({ ...current, rows: current.rows.map((r) => ({ ...r, status })) }));
  }

  async function save() {
    setSaving(true);
    const result = await saveAttendanceAction({ groupId, date, entries: changed.map((r) => ({ studentId: r.studentId, status: r.status })) });
    setSaving(false);
    if (!result.success) return void toast.error(result.error);
    toast.success(result.message ?? 'Lista guardada');
    await load();
    onSaved?.();
  }

  if (loading && rows.length === 0) return <p className="p-4 text-sm text-muted-foreground">Cargando la lista…</p>;
  if (rows.length === 0) {
    return <EmptyState title="Este grupo no tiene alumnas activas" description="Asigna alumnas al grupo desde la pestaña Grupos o desde su ficha." />;
  }

  const count = (status: AttendanceStatus) => rows.filter((r) => r.status === status).length;
  const unmarked = rows.filter((r) => !r.status).length;

  return (
    <div className="space-y-3">
      {lockedReason && <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">{lockedReason}</p>}

      {editable && date === todayIso() && <CheckInQrPanel groupId={groupId} date={date} groupName={groupName} onLiveChange={setLive} />}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {ATTENDANCE_STATUSES.map((status) => (
          <span key={status} className={cn('rounded-full border px-2.5 py-1 font-medium', count(status) > 0 ? ACTIVE_TONE[status] : 'border-border text-muted-foreground')}>
            {ATTENDANCE_LABELS[status]} {count(status)}
          </span>
        ))}
        <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">Sin marcar {unmarked}</span>
        {editable && (
          <span className="ml-auto flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => markAll('PRESENT')}>Todas presentes</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => markAll(null)} disabled={rows.every((r) => !r.status)}>Limpiar</Button>
          </span>
        )}
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label="Lista de asistencia">
        {rows.map((row) => (
          <li key={row.studentId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{initials(row.fullName)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.fullName}</p>
                {row.qrTime && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground" title={`Se registró con el QR a las ${row.qrTime}`}>
                    <QrCode className="size-3" aria-hidden="true" /> Con QR a las {row.qrTime}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Asistencia de ${row.fullName}`}>
              {ATTENDANCE_STATUSES.map((status) => {
                const Icon = STATUS_ICON[status];
                const active = row.status === status;
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={!editable}
                    aria-pressed={active}
                    onClick={() => mark(row.studentId, active ? null : status)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      active ? ACTIVE_TONE[status] : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {ATTENDANCE_LABELS[status]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      {editable && (
        <div className="flex items-center justify-end gap-3">
          {unmarked > 0 && <p className="text-xs text-muted-foreground">{unmarked} sin marcar</p>}
          <Button disabled={saving || !dirty} onClick={save}>{saving ? 'Guardando…' : 'Guardar lista'}</Button>
        </div>
      )}
    </div>
  );
}

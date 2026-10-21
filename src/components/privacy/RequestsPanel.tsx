'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { REQUEST_STATUS_LABELS, REQUEST_TYPES, REQUEST_TYPE_DESCRIPTIONS, REQUEST_TYPE_LABELS } from '@/lib/privacy/constants';
import { deadlineState, effectiveDueDate, maxExtensionDate, type DeadlineState } from '@/lib/privacy/deadlines';
import {
  createManualRequestAction,
  extendDataSubjectRequestAction,
  regeneratePrivacyPortalAction,
  sharePrivacyPortalAction,
  updateDataSubjectRequestAction,
} from '@/modules/data-protection/actions/data-protection.actions';
import type { DataSubjectRequest, DataSubjectRequestType } from '@prisma/client';

export type RequestRow = DataSubjectRequest & { deadline: DeadlineState };

/** Lo que la búsqueda necesita de una solicitud: a quién buscar y si ya se puede entregar una copia. */
export interface SearchSeed {
  email: string;
  rut: string;
  requestId: string;
  identityVerified: boolean;
  canExport: boolean;
}

interface Props {
  initialRequests: RequestRow[];
  initialPortalUrl: string | null;
  onSearchPerson: (seed: SearchSeed) => void;
}

const dateLabel = (date: Date | string) => new Date(date).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', year: 'numeric' });
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function DeadlineBadge({ deadline }: { deadline: DeadlineState }) {
  switch (deadline.kind) {
    case 'CLOSED':
      return <StatusBadge tone="neutral">Cerrada</StatusBadge>;
    case 'OVERDUE':
      return <StatusBadge tone="danger">Vencida hace {deadline.daysOverdue} {deadline.daysOverdue === 1 ? 'día' : 'días'}</StatusBadge>;
    case 'DUE_SOON':
      return <StatusBadge tone="warning">Vence en {deadline.daysLeft} {deadline.daysLeft === 1 ? 'día' : 'días'}</StatusBadge>;
    default:
      return <StatusBadge tone="success">{deadline.daysLeft} días de plazo</StatusBadge>;
  }
}

export default function RequestsPanel({ initialRequests, initialPortalUrl, onSearchPerson }: Props) {
  const confirm = useConfirm();
  const [requests, setRequests] = useState(initialRequests);
  const [portalUrl, setPortalUrl] = useState(initialPortalUrl);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const [manual, setManual] = useState({ type: 'ACCESS' as DataSubjectRequestType, requesterName: '', requesterEmail: '', requesterRut: '', details: '', receivedAt: '' });
  const [note, setNote] = useState<Record<string, string>>({});
  const [extension, setExtension] = useState<Record<string, { until: string; reason: string }>>({});

  const replace = (updated: RequestRow) => setRequests((current) => current.map((r) => (r.id === updated.id ? updated : r)));

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  const share = () =>
    run(async () => {
      const result = await sharePrivacyPortalAction();
      if (!result.success) return void toast.error(result.error);
      setPortalUrl(result.data);
    });

  const regenerate = async () => {
    if (!(await confirm('El enlace anterior dejará de funcionar. Si ya lo publicaste en tu sitio o en una política, tendrás que actualizarlo. ¿Regenerar?'))) return;
    await run(async () => {
      const result = await regeneratePrivacyPortalAction();
      if (!result.success) return void toast.error(result.error);
      setPortalUrl(result.data);
      toast.success(result.message ?? 'Enlace regenerado');
    });
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto manualmente.');
    }
  };

  const createManual = () =>
    run(async () => {
      const result = await createManualRequestAction({
        type: manual.type,
        requesterName: manual.requesterName,
        requesterEmail: manual.requesterEmail,
        ...(manual.requesterRut.trim() ? { requesterRut: manual.requesterRut } : {}),
        ...(manual.details.trim() ? { details: manual.details } : {}),
        ...(manual.receivedAt ? { receivedAt: manual.receivedAt } : {}),
      });
      if (!result.success) return void toast.error(result.error);
      const row: RequestRow = { ...result.data, deadline: deadlineState(result.data) };
      setRequests((current) => [row, ...current]);
      setManual({ type: 'ACCESS', requesterName: '', requesterEmail: '', requesterRut: '', details: '', receivedAt: '' });
      setShowManual(false);
      toast.success(result.message ?? 'Registrada');
    });

  const update = (request: RequestRow, input: { status: RequestRow['status']; identityVerified?: boolean }) =>
    run(async () => {
      const result = await updateDataSubjectRequestAction(request.id, { ...input, resolutionNote: note[request.id] ?? request.resolutionNote ?? undefined });
      if (!result.success) return void toast.error(result.error);
      replace(result.data as RequestRow);
      toast.success(result.message ?? 'Actualizada');
    });

  const extend = (request: RequestRow) =>
    run(async () => {
      const draft = extension[request.id];
      if (!draft?.until) return void toast.error('Elige hasta qué fecha prorrogas');
      const result = await extendDataSubjectRequestAction(request.id, { extendedUntil: draft.until, reason: draft.reason });
      if (!result.success) return void toast.error(result.error);
      replace(result.data as RequestRow);
      toast.success(result.message ?? 'Plazo prorrogado');
    });

  const open = requests.filter((r) => r.status === 'RECEIVED' || r.status === 'IN_PROGRESS');
  const overdue = open.filter((r) => r.deadline.kind === 'OVERDUE').length;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Formulario público para tus titulares</h3>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          Las personas cuyos datos tratas (candidatas, clientes, compradores, trabajadores) pueden pedirte acceso, rectificación, supresión, oposición,
          portabilidad o bloqueo. Publica este enlace en tu política de privacidad y en tu sitio. Cada solicitud queda registrada con su plazo legal.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {portalUrl ? (
            <>
              <code className="min-w-0 max-w-full flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">{portalUrl}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => copy(portalUrl)}><Copy className="size-3.5" /> Copiar</Button>
              <a href={portalUrl} target="_blank" rel="noopener" className={buttonVariants({ size: 'sm', variant: 'ghost' })}><ExternalLink className="size-3.5" /> Abrir</a>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={regenerate}><RefreshCw className="size-3.5" /> Regenerar</Button>
            </>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={share}>Generar enlace del formulario</Button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={open.length ? 'info' : 'neutral'}>{open.length} abiertas</StatusBadge>
          <StatusBadge tone={overdue ? 'danger' : 'success'}>{overdue} vencidas</StatusBadge>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowManual((v) => !v)}>
          {showManual ? 'Cancelar' : 'Registrar solicitud recibida por otro medio'}
        </Button>
      </div>

      {showManual && (
        <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="manualType">Derecho que ejerce</Label>
            <select id="manualType" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value as DataSubjectRequestType })}>
              {REQUEST_TYPES.map((type) => <option key={type} value={type}>{REQUEST_TYPE_LABELS[type]} — {REQUEST_TYPE_DESCRIPTIONS[type]}</option>)}
            </select>
          </div>
          <div><Label htmlFor="manualName">Nombre</Label><Input id="manualName" value={manual.requesterName} onChange={(e) => setManual({ ...manual, requesterName: e.target.value })} /></div>
          <div><Label htmlFor="manualEmail">Correo</Label><Input id="manualEmail" type="email" value={manual.requesterEmail} onChange={(e) => setManual({ ...manual, requesterEmail: e.target.value })} /></div>
          <div><Label htmlFor="manualRut">RUT (opcional)</Label><Input id="manualRut" value={manual.requesterRut} onChange={(e) => setManual({ ...manual, requesterRut: e.target.value })} /></div>
          <div><Label htmlFor="manualReceived">Fecha en que la recibiste (opcional)</Label><Input id="manualReceived" type="date" max={isoDay(new Date())} value={manual.receivedAt} onChange={(e) => setManual({ ...manual, receivedAt: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="manualDetails">Detalle (opcional)</Label><Input id="manualDetails" value={manual.details} onChange={(e) => setManual({ ...manual, details: e.target.value })} /></div>
          <div className="sm:col-span-2"><Button type="button" size="sm" disabled={busy || !manual.requesterName.trim() || !manual.requesterEmail.trim()} onClick={createManual}>Registrar solicitud</Button></div>
        </section>
      )}

      {requests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aún no hay solicitudes. Cuando una persona use el formulario, aparecerá aquí con su plazo.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => {
            const expanded = openId === r.id;
            const closed = r.status === 'RESOLVED' || r.status === 'REJECTED';
            return (
              <li key={r.id} className="rounded-xl border border-border bg-card">
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left" onClick={() => setOpenId(expanded ? null : r.id)} aria-expanded={expanded}>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{REQUEST_TYPE_LABELS[r.type]} · {r.requesterName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.requesterEmail} · recibida {dateLabel(r.receivedAt)} · límite {dateLabel(effectiveDueDate(r))}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={closed ? 'neutral' : 'info'}>{REQUEST_STATUS_LABELS[r.status]}</StatusBadge>
                    <DeadlineBadge deadline={r.deadline} />
                  </span>
                </button>
                {expanded && (
                  <div className="space-y-3 border-t border-border p-3 text-sm">
                    <p className="text-muted-foreground">{REQUEST_TYPE_DESCRIPTIONS[r.type]}</p>
                    {r.details && <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-xs">{r.details}</p>}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Origen: {r.source === 'PUBLIC_FORM' ? 'formulario público' : 'registrada por el equipo'}</span>
                      {r.requesterRutClean && <span>· RUT informado: {r.requesterRutClean}</span>}
                      {r.extendedUntil && <span>· prorrogada hasta {dateLabel(r.extendedUntil)}</span>}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => onSearchPerson({ email: r.requesterEmail, rut: r.requesterRutClean ?? '', requestId: r.id, identityVerified: Boolean(r.identityVerifiedAt), canExport: r.type === 'ACCESS' || r.type === 'PORTABILITY' })}>Buscar sus datos</Button>
                      {!closed && (
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={Boolean(r.identityVerifiedAt)} disabled={busy} onChange={(e) => update(r, { status: r.status, identityVerified: e.target.checked })} />
                          Identidad verificada (comprobé que quien pide es el titular o su representante)
                        </label>
                      )}
                    </div>

                    {!closed ? (
                      <>
                        <div>
                          <Label htmlFor={`note-${r.id}`}>Constancia de lo realizado (o motivo del rechazo)</Label>
                          <Input id={`note-${r.id}`} value={note[r.id] ?? r.resolutionNote ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} placeholder="Ej.: se entregó copia de sus datos por correo el 12/11" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {r.status === 'RECEIVED' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => update(r, { status: 'IN_PROGRESS' })}>Marcar en curso</Button>}
                          <Button type="button" size="sm" disabled={busy} onClick={() => update(r, { status: 'RESOLVED' })}>Resolver</Button>
                          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => update(r, { status: 'REJECTED' })} className="text-destructive hover:text-destructive">Rechazar</Button>
                        </div>
                        <div className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                          <div>
                            <Label htmlFor={`ext-until-${r.id}`}>Prorrogar hasta</Label>
                            <Input id={`ext-until-${r.id}`} type="date" min={isoDay(effectiveDueDate(r))} max={isoDay(maxExtensionDate(new Date(r.receivedAt)))} value={extension[r.id]?.until ?? ''} onChange={(e) => setExtension({ ...extension, [r.id]: { until: e.target.value, reason: extension[r.id]?.reason ?? '' } })} />
                          </div>
                          <div>
                            <Label htmlFor={`ext-reason-${r.id}`}>Motivo</Label>
                            <Input id={`ext-reason-${r.id}`} value={extension[r.id]?.reason ?? ''} onChange={(e) => setExtension({ ...extension, [r.id]: { until: extension[r.id]?.until ?? '', reason: e.target.value } })} placeholder="Por la complejidad o el volumen de lo pedido" />
                          </div>
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => extend(r)}>Prorrogar</Button>
                        </div>
                      </>
                    ) : (
                      r.resolutionNote && <p className="rounded-lg bg-muted/40 p-2 text-xs"><strong>Constancia:</strong> {r.resolutionNote}</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

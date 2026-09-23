'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AtSign, Briefcase, CalendarClock, Check, FileSignature, Mail, MessageCircle, Pencil, Phone, Trash2, Trophy, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { formatShortDate } from '@/lib/intelligence/format';
import { toWhatsappDigits } from '@/lib/phone';
import {
  addActivityAction,
  deleteActivityAction,
  deleteOpportunityAction,
  getOpportunityAction,
  moveOpportunityStageAction,
  setActivityCompletedAction,
} from '@/modules/crm/actions/crm.actions';
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPES,
  DEAL_TYPE_LABELS,
  OPEN_STAGES,
  PRIORITY_LABELS,
  STAGE_LABELS,
  type ActivityTypeKey,
  type OpportunityStageKey,
} from '@/modules/crm/schema';
import { SPONSORSHIP_STATUS_LABELS, SPONSORSHIP_TIER_LABELS } from '@/modules/sponsorships/schema';
import type { OpportunityDetail } from '@/modules/crm/services/crm.service';
import { cn } from '@/lib/utils';
import { ConvertToSponsorshipDialog } from './ConvertToSponsorshipDialog';
import { DEAL_TYPE_TONE, PRIORITY_TONE, STAGE_TONE, fromDateInput } from './crm-ui';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Atajos de seguimiento típicos de la venta de auspicios: un clic y queda escrito. */
const QUICK_ACTIVITIES: Array<{ type: ActivityTypeKey; summary: string }> = [
  { type: 'EMAIL', summary: 'Enviar kit comercial y tarifario' },
  { type: 'MEETING', summary: 'Reunión de presentación del certamen' },
  { type: 'EMAIL', summary: 'Enviar propuesta formal' },
  { type: 'CALL', summary: 'Seguimiento de la propuesta' },
  { type: 'WHATSAPP', summary: 'Confirmar asistencia a la gala' },
];

interface Props {
  opportunityId: string | null;
  canWrite: boolean;
  canConvert: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (detail: OpportunityDetail) => void;
}

export function OpportunityDetailDialog({ opportunityId, canWrite, canConvert, onClose, onChanged, onEdit }: Props) {
  const confirm = useConfirm();
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [activityType, setActivityType] = useState<ActivityTypeKey>('CALL');
  const [activitySummary, setActivitySummary] = useState('');
  const [activityDue, setActivityDue] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [askingLost, setAskingLost] = useState(false);
  const [converting, setConverting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    if (!opportunityId) return;
    const result = await getOpportunityAction(opportunityId);
    if (result.success) {
      setDetail(result.data);
      setLoadedAt(Date.now());
    } else toast.error(result.error);
  }, [opportunityId]);

  useEffect(() => {
    setDetail(null);
    setAskingLost(false);
    setConverting(false);
    setLostReason('');
    void load();
  }, [load]);

  async function moveTo(stage: OpportunityStageKey, reason?: string) {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await moveOpportunityStageAction(detail.id, { stage, lostReason: reason });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Etapa actualizada');
      setAskingLost(false);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function addActivity(completed: boolean) {
    if (!detail) return;
    setBusy(true);
    try {
      const result = await addActivityAction({
        opportunityId: detail.id,
        type: activityType,
        summary: activitySummary,
        dueAt: fromDateInput(activityDue) ?? undefined,
        completed,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Actividad guardada');
      setActivitySummary('');
      setActivityDue('');
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActivity(id: string, completed: boolean) {
    const result = await setActivityCompletedAction(id, completed);
    if (!result.success) toast.error(result.error);
    await load();
    onChanged();
  }

  async function removeActivity(id: string) {
    if (!(await confirm({ title: '¿Eliminar esta actividad?', confirmLabel: 'Eliminar' }))) return;
    const result = await deleteActivityAction(id);
    if (!result.success) toast.error(result.error);
    await load();
    onChanged();
  }

  async function removeOpportunity() {
    if (!detail) return;
    const ok = await confirm({
      title: `¿Eliminar "${detail.title}"?`,
      description: 'Se borran también sus actividades. Si solo se cayó el negocio, márcalo como perdido: así queda en las estadísticas.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const result = await deleteOpportunityAction(detail.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Eliminada');
    onChanged();
    onClose();
  }

  const closed = detail?.stage === 'WON' || detail?.stage === 'LOST';
  const now = loadedAt;
  const phone = detail?.person?.phone ?? detail?.prospectPhone ?? detail?.contact?.phone ?? null;
  const email = detail?.person?.email ?? detail?.prospectEmail ?? detail?.contact?.email ?? null;
  const canShowConvert = Boolean(detail && canWrite && canConvert && detail.stage === 'WON' && detail.dealType === 'SPONSORSHIP' && !detail.sponsorshipContract);

  return (
    <Dialog open={opportunityId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        {!detail ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <DialogTitle>{detail.title}</DialogTitle>
                <StatusBadge tone={STAGE_TONE[detail.stage]}>{STAGE_LABELS[detail.stage]}</StatusBadge>
                <StatusBadge tone={DEAL_TYPE_TONE[detail.dealType]}>{DEAL_TYPE_LABELS[detail.dealType]}</StatusBadge>
                <StatusBadge tone={PRIORITY_TONE[detail.priority]}>Prioridad {PRIORITY_LABELS[detail.priority].toLowerCase()}</StatusBadge>
              </div>
              <DialogDescription>
                {detail.contact ? `${detail.contact.razonSocial} · ${detail.contact.rut}` : `Prospecto: ${detail.prospectName ?? '—'}`}
                {detail.project && ` · ${detail.project.name}`}
                {detail.owner && ` · Responsable: ${detail.owner.name}`}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <dt className="text-xs text-muted-foreground">Efectivo (neto)</dt>
                <dd className="font-semibold tabular-nums">{formatCurrency(detail.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Canje</dt>
                <dd className="font-semibold tabular-nums">{detail.isBarter ? formatCurrency(detail.barterValuation) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Probabilidad</dt>
                <dd className="font-semibold tabular-nums">{detail.probability}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ponderado</dt>
                <dd className="font-semibold tabular-nums">{formatCurrency(Math.round((detail.amount * detail.probability) / 100))}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cierre esperado</dt>
                <dd className="font-semibold">{detail.expectedCloseDate ? formatShortDate(detail.expectedCloseDate) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{closed ? 'Cerrado' : 'En etapa'}</dt>
                <dd className="font-semibold tabular-nums">
                  {closed && detail.closedAt ? formatShortDate(detail.closedAt) : `${Math.max(0, Math.floor((now - new Date(detail.stageChangedAt).getTime()) / DAY_MS))} d`}
                </dd>
              </div>
            </dl>

            {detail.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contacto</p>
                {detail.person ? (
                  <p className="mt-1 font-medium text-foreground">
                    {detail.person.fullName}
                    {detail.person.jobTitle && <span className="font-normal text-muted-foreground"> · {detail.person.jobTitle}</span>}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">Sin persona de contacto asignada</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {email && (
                    <a href={`mailto:${email}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                      <Mail className="size-3.5" aria-hidden="true" />
                      {email}
                    </a>
                  )}
                  {phone && (
                    <>
                      <a href={`tel:${phone}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                        <Phone className="size-3.5" aria-hidden="true" />
                        {phone}
                      </a>
                      <a
                        href={`https://wa.me/${toWhatsappDigits(phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        <MessageCircle className="size-3.5" aria-hidden="true" />
                        WhatsApp
                      </a>
                    </>
                  )}
                  {detail.person?.instagram && (
                    <a
                      href={`https://instagram.com/${detail.person.instagram.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      <AtSign className="size-3.5" aria-hidden="true" />@{detail.person.instagram.replace(/^@/, '')}
                    </a>
                  )}
                  {detail.person?.linkedinUrl && (
                    <a href={detail.person.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">
                      <Briefcase className="size-3.5" aria-hidden="true" />
                      LinkedIn
                    </a>
                  )}
                  {!email && !phone && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><AtSign className="size-3.5" aria-hidden="true" />Sin datos de contacto</span>}
                </div>
              </div>

              {detail.dealType === 'SPONSORSHIP' && (
                <div className="rounded-md border border-border p-3 text-sm">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Auspicio</p>
                  <p className="mt-1 text-foreground">
                    {detail.package ? detail.package.name : 'Sin plan del tarifario'}
                    {detail.sponsorshipTier && <span className="text-muted-foreground"> · {SPONSORSHIP_TIER_LABELS[detail.sponsorshipTier]}</span>}
                  </p>
                  {detail.isBarter && detail.barterDescription && <p className="mt-1 text-xs text-muted-foreground">Canje: {detail.barterDescription}</p>}
                  {detail.sponsorshipContract ? (
                    <Link
                      href={`/dashboard/sponsorships/${detail.sponsorshipContract.id}`}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-success-soft px-2.5 py-1 text-xs font-medium text-success hover:underline"
                    >
                      <FileSignature className="size-3.5" aria-hidden="true" />
                      Contrato {SPONSORSHIP_STATUS_LABELS[detail.sponsorshipContract.status].toLowerCase()} — ver en Auspicios
                    </Link>
                  ) : canShowConvert ? (
                    <Button type="button" size="sm" className="mt-2" onClick={() => setConverting(true)}>
                      <FileSignature aria-hidden="true" />
                      Convertir en contrato de auspicio
                    </Button>
                  ) : detail.stage === 'WON' ? (
                    <p className="mt-2 text-xs text-muted-foreground">Para crear el contrato se necesita el módulo Auspicios y permiso de escritura en él.</p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Al ganarlo podrás convertirlo en contrato con un clic.</p>
                  )}
                </div>
              )}
            </div>

            {(detail.source || detail.notes || detail.lostReason) && (
              <div className="mt-3 space-y-1 text-sm">
                {detail.source && <p className="text-muted-foreground">Origen: {detail.source}</p>}
                {detail.lostReason && <p className="text-danger">Motivo de pérdida: {detail.lostReason}</p>}
                {detail.notes && <p className="whitespace-pre-line text-foreground">{detail.notes}</p>}
              </div>
            )}

            {canWrite && (
              <div className="mt-4 flex flex-wrap gap-2">
                {!closed && (
                  <select
                    aria-label="Mover a etapa"
                    className={cn(nativeSelectClass, 'w-auto')}
                    value={detail.stage}
                    disabled={busy}
                    onChange={(e) => void moveTo(e.target.value as OpportunityStageKey)}
                  >
                    {OPEN_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                )}
                {!closed && (
                  <>
                    <Button type="button" size="sm" disabled={busy} onClick={() => void moveTo('WON')}>
                      <Trophy aria-hidden="true" />
                      Ganado
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setAskingLost(true)}>
                      <XCircle aria-hidden="true" />
                      Perdido
                    </Button>
                  </>
                )}
                {closed && !detail.sponsorshipContract && (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void moveTo('NEGOTIATION')}>
                    Reabrir negocio
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(detail)}>
                  <Pencil aria-hidden="true" />
                  Editar
                </Button>
                <Button type="button" size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => void removeOpportunity()}>
                  <Trash2 aria-hidden="true" />
                  Eliminar
                </Button>
              </div>
            )}

            {askingLost && (
              <div className="mt-3 rounded-md border border-danger/30 bg-danger-soft p-3">
                <Label htmlFor="lost-reason">¿Por qué se perdió?</Label>
                <div className="mt-1 flex gap-2">
                  <Input id="lost-reason" value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Presupuesto de la marca, eligió otro evento, plazos…" />
                  <Button type="button" size="sm" disabled={busy || !lostReason.trim()} onClick={() => void moveTo('LOST', lostReason)}>
                    Confirmar
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-foreground">Actividades</h3>
              {canWrite && (
                <div className="mt-2 space-y-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ACTIVITIES.map((quick) => (
                      <button
                        key={quick.summary}
                        type="button"
                        onClick={() => {
                          setActivityType(quick.type);
                          setActivitySummary(quick.summary);
                        }}
                        className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      >
                        {quick.summary}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[140px_1fr_150px]">
                    <select aria-label="Tipo de actividad" className={nativeSelectClass} value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityTypeKey)}>
                      {ACTIVITY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {ACTIVITY_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                    <Input aria-label="Descripción" value={activitySummary} onChange={(e) => setActivitySummary(e.target.value)} placeholder="Ej.: Llamar para confirmar la propuesta" />
                    <Input aria-label="Fecha" type="date" value={activityDue} onChange={(e) => setActivityDue(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busy || !activitySummary.trim()} onClick={() => void addActivity(true)}>
                      Registrar como hecha
                    </Button>
                    <Button type="button" size="sm" disabled={busy || !activitySummary.trim()} onClick={() => void addActivity(false)}>
                      <CalendarClock aria-hidden="true" />
                      Agendar
                    </Button>
                  </div>
                </div>
              )}
              <ul className="mt-3 space-y-2">
                {detail.activities.length === 0 && <li className="text-sm text-muted-foreground">Sin actividades todavía.</li>}
                {detail.activities.map((activity) => {
                  const done = activity.completedAt !== null;
                  const overdue = !done && activity.dueAt !== null && new Date(activity.dueAt).getTime() < now;
                  return (
                    <li key={activity.id} className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => void toggleActivity(activity.id, !done)}
                        aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                          done ? 'border-success bg-success text-white' : 'border-input hover:border-foreground'
                        )}
                      >
                        {done && <Check className="size-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm whitespace-pre-line', done ? 'text-muted-foreground line-through' : 'text-foreground')}>{activity.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {ACTIVITY_TYPE_LABELS[activity.type]}
                          {activity.dueAt && <span className={cn(overdue && 'font-medium text-danger')}> · {overdue ? 'venció' : 'para'} el {formatShortDate(activity.dueAt)}</span>}
                          {activity.user && ` · ${activity.user.name}`}
                        </p>
                      </div>
                      {canWrite && (
                        <button type="button" onClick={() => void removeActivity(activity.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger" aria-label="Eliminar actividad">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {converting && (
              <ConvertToSponsorshipDialog
                opportunity={detail}
                open={converting}
                onOpenChange={setConverting}
                onConverted={() => {
                  setConverting(false);
                  void load();
                  onChanged();
                }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

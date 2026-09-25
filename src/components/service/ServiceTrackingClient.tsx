'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Receipt, Wrench } from 'lucide-react';
import {
  PublicBadge,
  PublicButton,
  PublicCard,
  PublicCardHeader,
  PublicConfirmDialog,
  PublicField,
  PublicFooter,
  PublicPage,
  PublicProgress,
  PublicRow,
  PublicShell,
  PublicTopBar,
  PublicTotal,
} from '@/components/public/PublicShell';
import { formatCurrency } from '@/lib/chile/tax';
import { PUBLIC_STEPS, publicStepIndex, SERVICE_STATUS_LABELS } from '@/lib/service/tickets';
import { decideServiceEstimateAction } from '@/modules/service-desk/actions/service-portal.actions';
import type { PublicServiceView } from '@/modules/service-desk/services/service-tickets.service';

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

function formatDay(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * Seguimiento público de una orden de servicio (`/servicio/[token]`): estado,
 * diagnóstico y presupuesto, que el cliente aprueba o rechaza desde aquí.
 */
export default function ServiceTrackingClient({ token, view }: { token: string; view: PublicServiceView }) {
  const router = useRouter();
  const [decision, setDecision] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const cancelled = view.status === 'CANCELLED';
  const step = publicStepIndex(view.status);
  const percent = cancelled ? 0 : Math.round(((step + 1) / PUBLIC_STEPS.length) * 100);
  const awaiting = view.status === 'WAITING_APPROVAL';

  async function decide() {
    if (decision === null) return;
    setSending(true);
    setFeedback(null);
    try {
      const result = await decideServiceEstimateAction(token, { approve: decision, comment: comment.trim() || undefined });
      setFeedback(result.success ? { ok: true, text: result.message ?? 'Respuesta registrada' } : { ok: false, text: result.error });
      if (result.success) router.refresh();
    } finally {
      setSending(false);
      setDecision(null);
    }
  }

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={view.company.name} right={<PublicBadge tone="accent">Servicio técnico</PublicBadge>} />
      <PublicShell wide>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Wrench className="size-5" />}
            eyebrow={`Orden N° ${view.folio} · recibido el ${formatDate(view.receivedAt)}`}
            title={[view.equipment, view.brandModel].filter(Boolean).join(' · ')}
            subtitle={`Hola ${view.customerFirstName}: aquí puedes seguir el estado de tu equipo.`}
          />
          <div className="mt-2 space-y-3">
            <PublicRow label="Estado" value={<PublicBadge tone={cancelled ? 'neutral' : view.status === 'READY' || view.status === 'DELIVERED' ? 'ok' : awaiting ? 'warn' : 'accent'}>{SERVICE_STATUS_LABELS[view.status]}</PublicBadge>} strong />
            {!cancelled && <PublicProgress percent={percent} label={PUBLIC_STEPS.map((item, index) => (index <= step ? `✓ ${item.label}` : item.label)).join('  ·  ')} />}
            {view.promisedDate && !['DELIVERED', 'CANCELLED'].includes(view.status) && <PublicRow label="Fecha comprometida" value={formatDay(view.promisedDate)} />}
            {view.serialNumber && <PublicRow label="N° de serie" value={view.serialNumber} />}
            {view.warranty && <PublicRow label="Condición" value="En garantía" />}
          </div>
        </PublicCard>

        <PublicCard>
          <PublicCardHeader align="start" icon={<ClipboardList className="size-5" />} title="Diagnóstico" subtitle={view.diagnosis ? undefined : 'Nuestro técnico está revisando tu equipo.'} />
          <PublicRow label="Falla informada" value={view.reportedIssue} />
          {view.diagnosis && <p className="pub-subtitle mt-3 whitespace-pre-line">{view.diagnosis}</p>}
        </PublicCard>

        {view.estimate && (
          <PublicCard>
            <PublicCardHeader
              align="start"
              icon={<Receipt className="size-5" />}
              title="Presupuesto"
              subtitle={
                awaiting
                  ? 'Revísalo y apruébalo para que comencemos la reparación.'
                  : view.estimateDecision === 'APPROVED'
                    ? 'Presupuesto aprobado.'
                    : view.estimateDecision === 'REJECTED'
                      ? 'Presupuesto rechazado: el equipo queda listo para retiro.'
                      : undefined
              }
            />
            {view.estimate.lines.map((line, index) => (
              <PublicRow key={index} label={`${line.description}${line.quantity !== 1 ? ` × ${line.quantity.toLocaleString('es-CL')}` : ''}`} value={formatCurrency(Math.round(line.quantity * line.unitPrice))} />
            ))}
            <PublicRow label="Neto" value={formatCurrency(view.estimate.net)} />
            <PublicRow label="IVA 19%" value={formatCurrency(view.estimate.iva)} />
            <PublicTotal label="Total" value={formatCurrency(view.estimate.total)} />
            {awaiting && (
              <div className="mt-4 space-y-3">
                <PublicField id="estimate-comment" label="Comentario" optional>
                  <input id="estimate-comment" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
                </PublicField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PublicButton type="button" full disabled={sending} onClick={() => setDecision(true)}>
                    Aprobar presupuesto
                  </PublicButton>
                  <PublicButton type="button" variant="ghost" full disabled={sending} onClick={() => setDecision(false)}>
                    No reparar
                  </PublicButton>
                </div>
              </div>
            )}
            {feedback && (
              <p role="status" className={feedback.ok ? 'pub-hint mt-3' : 'pub-error mt-3'}>
                {feedback.text}
              </p>
            )}
          </PublicCard>
        )}

        {view.events.length > 0 && (
          <PublicCard>
            <PublicCardHeader align="start" title="Novedades" />
            {view.events.map((event, index) => (
              <PublicRow key={index} label={`${formatDate(event.createdAt)}${event.status ? ` · ${SERVICE_STATUS_LABELS[event.status]}` : ''}`} value={event.note ?? ''} />
            ))}
          </PublicCard>
        )}

        <PublicFooter>
          {[view.company.name, view.company.address, view.company.phone, view.company.email].filter(Boolean).join(' · ')}
        </PublicFooter>
      </PublicShell>

      <PublicConfirmDialog
        open={decision !== null}
        title={decision ? '¿Aprobar el presupuesto?' : '¿Rechazar el presupuesto?'}
        message={decision ? `Autorizas la reparación por ${formatCurrency(view.estimate?.total ?? 0)} (IVA incluido).` : 'No repararemos el equipo y quedará listo para que lo retires.'}
        confirmLabel={decision ? 'Sí, aprobar' : 'Sí, no reparar'}
        busy={sending}
        onConfirm={decide}
        onCancel={() => setDecision(null)}
      />
    </PublicPage>
  );
}

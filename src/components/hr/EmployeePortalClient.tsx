'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, FileText, TreePalm } from 'lucide-react';
import {
  PublicBadge,
  PublicButton,
  PublicCard,
  PublicCardHeader,
  PublicField,
  PublicFooter,
  PublicPage,
  PublicRow,
  PublicShell,
  PublicTopBar,
} from '@/components/public/PublicShell';
import { formatCurrency } from '@/lib/chile/tax';
import { requestLeaveFromPortalAction } from '@/modules/hr/actions/portal.actions';
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, PORTAL_LEAVE_TYPES, periodLabel } from '@/modules/hr/schema';
import type { EmployeePortalView } from '@/modules/hr/services/employee-portal.service';

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function days(value: number): string {
  return `${value.toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${value === 1 ? 'día' : 'días'}`;
}

/**
 * Portal del trabajador (`/trabajador/[token]`): sus liquidaciones cerradas,
 * su saldo de vacaciones y una solicitud de días. Sin cuenta: el enlace
 * personal es la llave.
 */
export default function EmployeePortalClient({ token, view }: { token: string; view: EmployeePortalView }) {
  const router = useRouter();
  const [type, setType] = useState<(typeof PORTAL_LEAVE_TYPES)[number]>('VACATION');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setFeedback(null);
    try {
      const result = await requestLeaveFromPortalAction(token, { type, startDate, endDate, reason: reason.trim() || undefined });
      if (!result.success) {
        setFeedback({ ok: false, text: result.error });
        return;
      }
      setFeedback({ ok: true, text: result.message ?? 'Solicitud enviada' });
      setStartDate('');
      setEndDate('');
      setReason('');
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const firstName = view.employee.fullName.split(' ')[0];

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={view.company.businessName} right={<PublicBadge tone="accent">Portal del trabajador</PublicBadge>} />
      <PublicShell wide>
        <PublicCard glow>
          <PublicCardHeader
            icon={<TreePalm className="size-5" />}
            eyebrow={`${view.employee.position} · desde el ${formatDate(view.employee.hireDate)}`}
            title={`Hola, ${firstName}`}
            subtitle="Aquí están tus liquidaciones de sueldo y tus vacaciones."
          />
          <div className="mt-2">
            <PublicRow label="Vacaciones disponibles" value={<strong>{days(view.vacation.available)}</strong>} strong />
            <PublicRow label="Devengadas a la fecha" value={days(view.vacation.accrued)} />
            <PublicRow label="Tomadas" value={days(view.vacation.taken)} />
            {view.vacation.pending > 0 && <PublicRow label="Por aprobar" value={days(view.vacation.pending)} />}
          </div>
        </PublicCard>

        <PublicCard>
          <PublicCardHeader align="start" icon={<FileText className="size-5" />} title="Mis liquidaciones" subtitle="Ábrelas para verlas o descargarlas en PDF." />
          {view.payslips.length === 0 ? (
            <p className="pub-subtitle">Aún no hay liquidaciones cerradas.</p>
          ) : (
            <div>
              {view.payslips.map((slip) => (
                <Link key={slip.id} href={`/trabajador/${token}/liquidaciones/${slip.id}`} className="block rounded-lg transition-opacity hover:opacity-80">
                  <PublicRow label={periodLabel(slip.period.year, slip.period.month)} value={`${formatCurrency(slip.netPay)} líquido →`} />
                </Link>
              ))}
            </div>
          )}
        </PublicCard>

        {view.canRequest && (
          <PublicCard>
            <PublicCardHeader align="start" icon={<CalendarDays className="size-5" />} title="Pedir días" subtitle="Tu solicitud llega a Recursos Humanos para su aprobación." />
            <form onSubmit={submit} className="space-y-4">
              <PublicField id="portal-type" label="Tipo">
                <select id="portal-type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  {PORTAL_LEAVE_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {LEAVE_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </PublicField>
              <div className="grid gap-4 sm:grid-cols-2">
                <PublicField id="portal-start" label="Desde">
                  <input id="portal-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </PublicField>
                <PublicField id="portal-end" label="Hasta">
                  <input id="portal-end" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} required />
                </PublicField>
              </div>
              <PublicField id="portal-reason" label="Comentario" optional>
                <input id="portal-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
              </PublicField>
              {feedback && (
                <p role="status" className={feedback.ok ? 'pub-hint' : 'pub-error'}>
                  {feedback.text}
                </p>
              )}
              <PublicButton type="submit" full disabled={sending || !startDate || !endDate}>
                {sending ? 'Enviando…' : 'Enviar solicitud'}
              </PublicButton>
            </form>
          </PublicCard>
        )}

        {view.leaves.length > 0 && (
          <PublicCard>
            <PublicCardHeader align="start" title="Mis solicitudes" />
            {view.leaves.map((leave) => (
              <PublicRow
                key={leave.id}
                label={`${LEAVE_TYPE_LABELS[leave.type]} · ${formatDate(leave.startDate)} al ${formatDate(leave.endDate)} (${days(leave.businessDays)} hábiles)`}
                value={<PublicBadge tone={leave.status === 'APPROVED' ? 'ok' : leave.status === 'PENDING' ? 'warn' : 'neutral'}>{LEAVE_STATUS_LABELS[leave.status]}</PublicBadge>}
              />
            ))}
          </PublicCard>
        )}

        <PublicFooter>Este enlace es personal: no lo compartas. Si crees que alguien más lo tiene, pide a Recursos Humanos uno nuevo.</PublicFooter>
      </PublicShell>
    </PublicPage>
  );
}

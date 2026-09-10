'use client';

import { useEffect, useState } from 'react';
import { Handshake } from 'lucide-react';
import { getSponsorshipPortalAction } from '@/modules/sponsorships/actions/public-sponsorships.actions';
import type { SponsorshipPortalView } from '@/modules/sponsorships/services/sponsorships.service';
import {
  SPONSORSHIP_DELIVERABLE_TYPE_LABELS,
  SPONSORSHIP_STATUS_LABELS,
  SPONSORSHIP_TIER_LABELS,
} from '@/modules/sponsorships/schema';
import { formatCurrency } from '@/lib/chile/tax';
import {
  IconCheck,
  PublicBadge,
  PublicCard,
  PublicCardHeader,
  PublicFooter,
  PublicPage,
  PublicProgress,
  PublicRow,
  PublicShell,
  PublicStatus,
  PublicTopBar,
} from '@/components/public/PublicShell';

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
};

/**
 * Portal público de la marca auspiciadora: solo lectura, sin sesión de
 * usuario ERP — todo corre contra `portalToken` vía la Server Action pública.
 *
 * Diseño: sistema público compartido (`@/components/public/PublicShell`), con
 * acento esmeralda. Es lo primero que ve alguien de la marca al abrir el
 * link: la página tiene que verse como una rendición de cuentas cuidada, no
 * como una pantalla interna del ERP filtrada hacia afuera.
 */
export default function SponsorPortalClient({ token }: { token: string }) {
  const [data, setData] = useState<SponsorshipPortalView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await getSponsorshipPortalAction(token);
      if (!result.success) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(result.data);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <PublicPage accent="emerald">
        <PublicShell wide>
          <div className="pub-skeleton" style={{ height: '7rem' }} />
          <div className="pub-skeleton" style={{ height: '9rem' }} />
          <div className="pub-skeleton" style={{ height: '12rem' }} />
        </PublicShell>
      </PublicPage>
    );
  }

  if (notFound || !data) {
    return (
      <PublicStatus
        accent="emerald"
        variant="error"
        title="Link de portal inválido o expirado"
        message="Contacta a tu contacto comercial en la organización para obtener uno nuevo."
      />
    );
  }

  const completed = data.deliverables.filter((d) => d.isCompleted).length;
  const total = data.deliverables.length;
  const pendingAmount = Math.max(data.cashAmount - data.paidAmount, 0);

  return (
    <PublicPage accent="emerald">
      <PublicTopBar brand={data.companyName} right="Portal de auspiciador" />
      <PublicShell wide>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Handshake size={22} strokeWidth={1.6} />}
            eyebrow={SPONSORSHIP_TIER_LABELS[data.tier]}
            title={data.razonSocial}
            subtitle={data.projectName}
            align="start"
          />
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <PublicBadge tone="accent">{SPONSORSHIP_STATUS_LABELS[data.status]}</PublicBadge>
            <PublicBadge tone={data.paymentStatus === 'PAID' ? 'ok' : 'warn'}>
              {PAYMENT_STATUS_LABEL[data.paymentStatus] ?? data.paymentStatus}
            </PublicBadge>
            {data.isBarter && <PublicBadge>Incluye canje</PublicBadge>}
          </div>
        </PublicCard>

        <PublicCard>
          <h2 className="pub-section-title">Cumplimiento de entregables</h2>
          <PublicProgress percent={data.compliancePercent} label={`${completed} de ${total} completados`} />
        </PublicCard>

        {data.cashAmount > 0 && (
          <PublicCard>
            <h2 className="pub-section-title">Estado de pago</h2>
            <PublicRow label="Monto acordado" value={formatCurrency(data.cashAmount)} />
            <PublicRow label="Pagado" value={formatCurrency(data.paidAmount)} />
            <PublicRow label="Saldo pendiente" value={formatCurrency(pendingAmount)} strong />
          </PublicCard>
        )}

        {data.isBarter && (
          <PublicCard>
            <h2 className="pub-section-title">Canje / Barter</h2>
            <PublicRow label="Valorización" value={formatCurrency(data.barterValuation)} />
            {data.barterDescription && <p className="pub-hint" style={{ marginTop: '0.5rem' }}>{data.barterDescription}</p>}
          </PublicCard>
        )}

        <PublicCard>
          <h2 className="pub-section-title">Checklist de entregables</h2>
          {data.deliverables.length === 0 ? (
            <p className="pub-hint">Todavía no hay entregables cargados.</p>
          ) : (
            <ul className="pub-checklist">
              {data.deliverables.map((d) => (
                <li key={d.id} className={d.isCompleted ? 'is-done' : ''}>
                  <span className="pub-checklist-mark" aria-hidden="true">{d.isCompleted && <IconCheck />}</span>
                  <span className="pub-checklist-body">
                    <span className="pub-checklist-title">{d.title}</span>
                    <span className="pub-checklist-meta">
                      {SPONSORSHIP_DELIVERABLE_TYPE_LABELS[d.type]}
                      {d.isCompleted && d.completedAt && ` · Completado el ${new Date(d.completedAt).toLocaleDateString('es-CL')}`}
                      {!d.isCompleted && d.dueDate && ` · Vence el ${new Date(d.dueDate).toLocaleDateString('es-CL')}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </PublicCard>
      </PublicShell>
      <PublicFooter>
        {data.companyName} · Portal privado de {data.razonSocial}
      </PublicFooter>
    </PublicPage>
  );
}

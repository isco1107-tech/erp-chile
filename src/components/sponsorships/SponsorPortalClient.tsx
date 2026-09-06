'use client';

import { useEffect, useState } from 'react';
import { getSponsorshipPortalAction } from '@/modules/sponsorships/actions/public-sponsorships.actions';
import type { SponsorshipPortalView } from '@/modules/sponsorships/services/sponsorships.service';
import {
  SPONSORSHIP_DELIVERABLE_TYPE_LABELS,
  SPONSORSHIP_STATUS_LABELS,
  SPONSORSHIP_TIER_LABELS,
} from '@/modules/sponsorships/schema';
import { formatCurrency } from '@/lib/chile/tax';

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
};

/**
 * Portal público de la marca auspiciadora: solo lectura, sin sesión de
 * usuario ERP — todo corre contra `portalToken` vía la Server Action pública.
 * Diseño autocontenido (sin el shell del dashboard): es lo primero que ve
 * alguien de la marca al abrir el link, no un usuario interno del ERP.
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
      <div className="min-h-screen bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-2xl animate-pulse space-y-5">
          <div className="h-24 rounded-xl border border-border bg-card" />
          <div className="h-28 rounded-xl border border-border bg-card" />
          <div className="h-32 rounded-xl border border-border bg-card" />
        </div>
      </div>
    );
  }
  if (notFound || !data) {
    return (
      <p className="p-8 text-center text-destructive">
        Link de portal inválido o expirado. Contacta a tu contacto comercial para obtener uno nuevo.
      </p>
    );
  }

  const completed = data.deliverables.filter((d) => d.isCompleted).length;
  const total = data.deliverables.length;

  return (
    <div className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Portal de Auspiciador</p>
          <h1 className="text-xl font-bold">{data.razonSocial}</h1>
          <p className="text-sm text-muted-foreground">
            {data.projectName} — {SPONSORSHIP_TIER_LABELS[data.tier]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{data.companyName}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Estado del contrato</p>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
              {SPONSORSHIP_STATUS_LABELS[data.status]}
            </span>
          </div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cumplimiento de entregables</span>
            <span className="font-semibold">{data.compliancePercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${data.compliancePercent}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{completed}/{total} entregables completados</p>
        </div>

        {data.cashAmount > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Estado de pago</p>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                {PAYMENT_STATUS_LABEL[data.paymentStatus] ?? data.paymentStatus}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monto acordado</span>
              <span>{formatCurrency(data.cashAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pagado</span>
              <span>{formatCurrency(data.paidAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-medium">
              <span>Saldo pendiente</span>
              <span>{formatCurrency(Math.max(data.cashAmount - data.paidAmount, 0))}</span>
            </div>
          </div>
        )}

        {data.isBarter && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">Canje / Barter</p>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-muted-foreground">Valorización</span>
              <span>{formatCurrency(data.barterValuation)}</span>
            </div>
            {data.barterDescription && <p className="mt-1 text-xs text-muted-foreground">{data.barterDescription}</p>}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">Checklist de entregables</p>
          {data.deliverables.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay entregables cargados.</p>
          )}
          <ul className="space-y-1.5">
            {data.deliverables.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                <span className={`inline-block size-2 shrink-0 rounded-full ${d.isCompleted ? 'bg-green-600' : 'bg-muted-foreground/40'}`} />
                <span className={`flex-1 ${d.isCompleted ? 'text-muted-foreground line-through' : ''}`}>{d.title}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {SPONSORSHIP_DELIVERABLE_TYPE_LABELS[d.type]}
                </span>
                {d.isCompleted && d.completedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(d.completedAt).toLocaleDateString('es-CL')}
                  </span>
                )}
                {!d.isCompleted && d.dueDate && (
                  <span className="text-[11px] text-muted-foreground">
                    Vence {new Date(d.dueDate).toLocaleDateString('es-CL')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

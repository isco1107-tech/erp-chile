import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPaymentPlanAction } from '@/modules/payment-plans/actions/payment-plans.actions';
import { PAYMENT_PLAN_FREQUENCY_LABELS, PAYMENT_PLAN_STATUS_LABELS } from '@/modules/payment-plans/schema';
import { formatRut } from '@/lib/chile/rut';
import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { can, getAuthContext } from '@/lib/auth/guards';
import PaymentPlanDetailClient from '@/components/payment-plans/PaymentPlanDetailClient';
import OnlinePaymentsSection from '@/components/payment-plans/OnlinePaymentsSection';
import { listOnlinePaymentsAction } from '@/modules/payment-plans/actions/online-payment.actions';
import { listTreasuryAccountOptions } from '@/modules/treasury/services/accounts.service';

export const metadata = { title: 'Plan de Pago' };

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export default async function PaymentPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context, onlinePayments] = await Promise.all([getPaymentPlanAction(id), getAuthContext(), listOnlinePaymentsAction(id)]);
  if (!result.success) notFound();

  const plan = result.data;
  const canWrite = can(context, 'paymentplans:write');
  const accounts = canWrite ? await listTreasuryAccountOptions(context.companyId) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/payment-plans" className={buttonVariants({ variant: 'outline' })}>
          ← Volver a Cuotas / Mensualidades
        </Link>
      </div>

      <div className="mx-auto max-w-4xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-5">
          <div>
            <h2 className="text-lg font-bold">{plan.contact.razonSocial}</h2>
            <p className="text-muted-foreground">
              {formatRut(plan.contact.rut)} — {plan.installmentCount} cuotas ({PAYMENT_PLAN_FREQUENCY_LABELS[plan.frequency]})
            </p>
            {plan.candidate && (
              <p className="mt-1 text-xs text-muted-foreground">
                Asociado a la candidata: {plan.candidate.stageName || plan.candidate.fullName}
              </p>
            )}
          </div>
          <StatusBadge tone={STATUS_TONE[plan.status] ?? 'neutral'}>{PAYMENT_PLAN_STATUS_LABELS[plan.status]}</StatusBadge>
        </div>

        {plan.penaltyBps > 0 && (
          <p className="text-xs text-muted-foreground">
            Multa por atraso configurada: {(plan.penaltyBps / 100).toLocaleString('es-CL')}% sobre el monto de la cuota vencida.
          </p>
        )}

        {plan.notes && (
          <p>
            <span className="font-medium text-foreground">Notas:</span> {plan.notes}
          </p>
        )}

        <PaymentPlanDetailClient plan={plan} canWrite={canWrite} accounts={accounts} />

        <OnlinePaymentsSection planId={plan.id} payments={onlinePayments.success ? onlinePayments.data : []} canWrite={canWrite} />
      </div>
    </div>
  );
}

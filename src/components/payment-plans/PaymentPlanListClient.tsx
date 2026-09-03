'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { listPaymentPlansAction } from '@/modules/payment-plans/actions/payment-plans.actions';
import type { PaymentPlanWithRelations } from '@/modules/payment-plans/services/payment-plans.service';
import { PAYMENT_PLAN_STATUS_LABELS, PAYMENT_PLAN_FREQUENCY_LABELS } from '@/modules/payment-plans/schema';
import { formatCurrency } from '@/lib/chile/tax';

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export default function PaymentPlanListClient({ canWrite }: { canWrite: boolean }) {
  const [plans, setPlans] = useState<PaymentPlanWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPaymentPlansAction().then((result) => {
      if (result.success) setPlans(result.data);
      else toast.error(result.error);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canWrite && (
          <Link href="/dashboard/payment-plans/new" className={buttonVariants({ variant: 'default' })}>
            Nuevo Plan de Pago
          </Link>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {!loading && plans.length === 0 && (
        <EmptyState
          title="Todavía no hay planes de pago"
          description="Crea el primer plan de cuotas/mensualidades para verlo aquí."
          action={
            canWrite ? (
              <Link href="/dashboard/payment-plans/new" className={buttonVariants({ size: 'sm' })}>
                Nuevo Plan de Pago
              </Link>
            ) : undefined
          }
        />
      )}

      {!loading && plans.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Candidata</th>
                <th className="px-3 py-2">Cuotas</th>
                <th className="px-3 py-2">Frecuencia</th>
                <th className="px-3 py-2 text-right">Monto total</th>
                <th className="px-3 py-2 text-right">Pagado</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const paid = plan.installments.reduce((sum, i) => sum + i.paidAmount, 0);
                return (
                  <tr key={plan.id} className="cursor-pointer border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/payment-plans/${plan.id}`} className="block">
                        {plan.contact.razonSocial}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {plan.candidate ? plan.candidate.stageName || plan.candidate.fullName : '—'}
                    </td>
                    <td className="px-3 py-2">{plan.installmentCount}</td>
                    <td className="px-3 py-2">{PAYMENT_PLAN_FREQUENCY_LABELS[plan.frequency]}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(plan.totalAmount)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(paid)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={STATUS_TONE[plan.status] ?? 'neutral'}>{PAYMENT_PLAN_STATUS_LABELS[plan.status]}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

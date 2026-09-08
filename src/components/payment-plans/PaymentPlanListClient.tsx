'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { deletePaymentPlanAction, listPaymentPlansAction } from '@/modules/payment-plans/actions/payment-plans.actions';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; clientName: string; paid: number } | null>(null);

  useEffect(() => {
    listPaymentPlansAction().then((result) => {
      if (result.success) setPlans(result.data);
      else toast.error(result.error);
      setLoading(false);
    });
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeletingId(id);
    try {
      const result = await deletePaymentPlanAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Plan de pago eliminado');
      setPlans((prev) => prev.filter((p) => p.id !== id));
      setDeleteTarget(null);
    } finally {
      setDeletingId(null);
    }
  }

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
                {canWrite && <th className="w-10 px-3 py-2" aria-hidden />}
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const paid = plan.installments.reduce((sum, i) => sum + i.paidAmount, 0);
                return (
                  <tr key={plan.id} className="group/row cursor-pointer border-t border-border hover:bg-muted/30">
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
                    {canWrite && (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={deletingId === plan.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteTarget({ id: plan.id, clientName: plan.contact.razonSocial, paid });
                          }}
                          aria-label={`Eliminar plan de pago de ${plan.contact.razonSocial}`}
                          title="Eliminar definitivamente"
                          className="rounded-lg p-1.5 text-muted-foreground opacity-100 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 sm:opacity-0 sm:group-hover/row:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar plan de pago"
        description={
          deleteTarget
            ? deleteTarget.paid > 0
              ? `¿Eliminar DEFINITIVAMENTE el plan de pago de "${deleteTarget.clientName}"? Ya tiene ${formatCurrency(deleteTarget.paid)} en pagos registrados — ese historial de cobro se pierde para siempre. Esta acción no se puede deshacer.`
              : `¿Eliminar DEFINITIVAMENTE el plan de pago de "${deleteTarget.clientName}"? Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Eliminar definitivamente"
        loading={deletingId !== null}
        onConfirm={handleDelete}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import {
  cancelPaymentPlanAction,
  deleteInstallmentAction,
  deletePaymentPlanAction,
  registerInstallmentPaymentAction,
} from '@/modules/payment-plans/actions/payment-plans.actions';
import {
  PAYMENT_METHOD_TYPES,
  PAYMENT_METHOD_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
} from '@/modules/payment-plans/schema';
import type { PaymentPlanWithRelations } from '@/modules/payment-plans/services/payment-plans.service';
import { formatCurrency } from '@/lib/chile/tax';

const PAYMENT_STATUS_TONE: Record<'UNPAID' | 'PARTIAL' | 'PAID', Tone> = {
  UNPAID: 'warning',
  PARTIAL: 'info',
  PAID: 'success',
};

const selectClass =
  'h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-0.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

interface Props {
  plan: PaymentPlanWithRelations;
  canWrite: boolean;
}

export default function PaymentPlanDetailClient({ plan, canWrite }: Props) {
  const router = useRouter();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<(typeof PAYMENT_METHOD_TYPES)[number]>('EFECTIVO');
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState(false);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [deletePlanConfirmOpen, setDeletePlanConfirmOpen] = useState(false);
  const [deleteInstallmentTarget, setDeleteInstallmentTarget] = useState<{ id: string; number: number } | null>(null);

  const now = new Date();
  const totalPaid = plan.installments.reduce((sum, i) => sum + i.paidAmount, 0);

  function openPaymentRow(installmentId: string, pendingBalance: number) {
    setPayingId(installmentId);
    setAmount(pendingBalance);
    setMethod('EFECTIVO');
  }

  async function handleRegisterPayment(installmentId: string) {
    setSaving(true);
    try {
      const result = await registerInstallmentPaymentAction(installmentId, plan.id, { amount, method });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Pago registrado');
      setPayingId(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelPlan() {
    setCancelling(true);
    try {
      const result = await cancelPaymentPlanAction(plan.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Plan cancelado');
      setCancelConfirmOpen(false);
      router.refresh();
    } finally {
      setCancelling(false);
    }
  }

  async function handleDeletePlan() {
    setDeletingPlan(true);
    try {
      const result = await deletePaymentPlanAction(plan.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setDeletePlanConfirmOpen(false);
      toast.success(result.message ?? 'Plan de pago eliminado');
      router.push('/dashboard/payment-plans');
      router.refresh();
    } finally {
      setDeletingPlan(false);
    }
  }

  async function handleDeleteInstallment() {
    if (!deleteInstallmentTarget) return;
    const { id } = deleteInstallmentTarget;
    setDeletingId(id);
    try {
      const result = await deleteInstallmentAction(id, plan.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Cuota eliminada');
      setDeleteInstallmentTarget(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-border p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Monto total</p>
          <p className="text-lg font-semibold">{formatCurrency(plan.totalAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pagado</p>
          <p className="text-lg font-semibold">{formatCurrency(totalPaid)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className="text-lg font-semibold">{formatCurrency(Math.max(plan.totalAmount - totalPaid, 0))}</p>
        </div>
      </div>

      {canWrite && (
        <div className="flex flex-wrap justify-end gap-2">
          {plan.status === 'ACTIVE' && (
            <Button type="button" variant="outline" size="sm" disabled={cancelling} onClick={() => setCancelConfirmOpen(true)}>
              {cancelling ? 'Cancelando...' : 'Cancelar plan de pago'}
            </Button>
          )}
          <Button type="button" variant="destructive" size="sm" disabled={deletingPlan} onClick={() => setDeletePlanConfirmOpen(true)}>
            <Trash2 className="size-3.5" />
            {deletingPlan ? 'Eliminando...' : 'Eliminar definitivamente'}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Vencimiento</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2 text-right">Pagado</th>
              <th className="px-3 py-2 text-right">Multa aplicada</th>
              <th className="px-3 py-2">Estado</th>
              {canWrite && <th className="px-3 py-2">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {plan.installments.map((installment) => {
              const isOverdue = installment.paymentStatus !== 'PAID' && new Date(installment.dueDate) < now;
              const pendingBalance = installment.amount - installment.paidAmount;
              const isPaying = payingId === installment.id;

              return (
                <tr key={installment.id} className={`border-t border-border ${isOverdue ? 'bg-destructive/5' : ''}`}>
                  <td className="px-3 py-2">{installment.installmentNumber}</td>
                  <td className={`px-3 py-2 ${isOverdue ? 'font-medium text-destructive' : ''}`}>
                    {new Date(installment.dueDate).toLocaleDateString('es-CL')}
                    {isOverdue && <span className="ml-1 text-xs">(vencida)</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCurrency(installment.amount)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(installment.paidAmount)}</td>
                  <td className="px-3 py-2 text-right">
                    {installment.penaltyApplied > 0 ? formatCurrency(installment.penaltyApplied) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={PAYMENT_STATUS_TONE[installment.paymentStatus]}>
                      {PAYMENT_STATUS_LABELS[installment.paymentStatus]}
                    </StatusBadge>
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2">
                      {installment.paymentStatus === 'PAID' ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : isPaying ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CurrencyInput value={amount} onChange={setAmount} className="h-7 w-28 text-xs" />
                          <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHOD_TYPES)[number])}
                            className={selectClass}
                          >
                            {PAYMENT_METHOD_TYPES.map((m) => (
                              <option key={m} value={m}>
                                {PAYMENT_METHOD_TYPE_LABELS[m]}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            size="xs"
                            disabled={saving || amount <= 0 || amount > pendingBalance}
                            onClick={() => handleRegisterPayment(installment.id)}
                          >
                            Guardar
                          </Button>
                          <Button type="button" size="xs" variant="ghost" onClick={() => setPayingId(null)}>
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button type="button" size="xs" variant="outline" onClick={() => openPaymentRow(installment.id, pendingBalance)}>
                            Registrar pago
                          </Button>
                          {installment.paidAmount === 0 && (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              disabled={deletingId === installment.id}
                              onClick={() => setDeleteInstallmentTarget({ id: installment.id, number: installment.installmentNumber })}
                              className="text-destructive hover:text-destructive"
                              aria-label={`Eliminar cuota N° ${installment.installmentNumber}`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title="Cancelar plan de pago"
        description="¿Cancelar este plan de pago? Las cuotas ya pagadas conservan su historial de cobro."
        confirmLabel="Cancelar plan"
        destructive={false}
        loading={cancelling}
        onConfirm={handleCancelPlan}
      />

      <ConfirmDialog
        open={deletePlanConfirmOpen}
        onOpenChange={setDeletePlanConfirmOpen}
        title="Eliminar plan de pago"
        description={
          totalPaid > 0
            ? `¿Eliminar DEFINITIVAMENTE este plan de pago y todas sus cuotas? Ya tiene ${formatCurrency(totalPaid)} en pagos registrados — ese historial de cobro se pierde para siempre junto con el plan. Esta acción no se puede deshacer.`
            : '¿Eliminar DEFINITIVAMENTE este plan de pago y todas sus cuotas? Esta acción no se puede deshacer y borra el registro por completo (no queda como "Cancelado" — desaparece).'
        }
        confirmLabel="Eliminar definitivamente"
        loading={deletingPlan}
        onConfirm={handleDeletePlan}
      />

      <ConfirmDialog
        open={deleteInstallmentTarget !== null}
        onOpenChange={(open) => !open && setDeleteInstallmentTarget(null)}
        title="Eliminar cuota"
        description={
          deleteInstallmentTarget ? `¿Eliminar la cuota N° ${deleteInstallmentTarget.number}? Esta acción no se puede deshacer.` : ''
        }
        confirmLabel="Eliminar"
        loading={deletingId !== null}
        onConfirm={handleDeleteInstallment}
      />
    </div>
  );
}

import Link from 'next/link';
import { Send } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { listPaymentBatchesAction } from '@/modules/treasury/actions/payment-batches.actions';
import { PAYMENT_BATCH_STATUS_LABELS } from '@/modules/treasury/schema';

export const metadata = { title: 'Nóminas de pago' };

const TONE: Record<keyof typeof PAYMENT_BATCH_STATUS_LABELS, Tone> = { DRAFT: 'warning', PAID: 'success', CANCELLED: 'neutral' };

function formatDate(value: Date): string {
  return value.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Santiago' });
}

export default async function PaymentBatchesPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'treasury:write');
  const result = await listPaymentBatchesAction();
  const batches = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tesorería"
        title="Nóminas de pago a proveedores"
        description="Elige las facturas a pagar, descarga el archivo para el portal de tu banco y, cuando el banco confirme, márcala pagada: cada factura queda abonada con su asiento."
        actions={
          canWrite ? (
            <Link href="/dashboard/treasury/payment-batches/new" className={buttonVariants()}>
              Nueva nómina
            </Link>
          ) : undefined
        }
      />
      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Nóminas">
        {batches.length === 0 ? (
          <EmptyState
            icon={<Send className="size-10 text-muted-foreground/40" aria-hidden="true" />}
            title="Aún no hay nóminas"
            description="Paga a varios proveedores en una sola carga al banco, en vez de transferencia por transferencia."
            action={
              canWrite ? (
                <Link href="/dashboard/treasury/payment-batches/new" className={buttonVariants({ size: 'sm' })}>
                  Armar la primera
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 font-medium">N°</th>
                  <th className="px-4 py-2.5 font-medium">Cuenta de origen</th>
                  <th className="px-4 py-2.5 font-medium">Fecha de pago</th>
                  <th className="px-4 py-2.5 text-right font-medium">Facturas</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/treasury/payment-batches/${batch.id}`} className="font-mono text-xs font-medium hover:underline">
                        #{batch.folio}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/dashboard/treasury/payment-batches/${batch.id}`} className="font-medium hover:underline">
                        {batch.bankAccountName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(batch.paymentDate)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{batch.itemCount}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(batch.totalAmount)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge tone={TONE[batch.status]}>{PAYMENT_BATCH_STATUS_LABELS[batch.status]}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import { bankName } from '@/lib/treasury/banks';
import PaymentBatchActions from '@/components/treasury/PaymentBatchActions';
import { getPaymentBatchAction } from '@/modules/treasury/actions/payment-batches.actions';
import { PAYMENT_BATCH_STATUS_LABELS } from '@/modules/treasury/schema';

export const metadata = { title: 'Nómina de pago' };

const TONE: Record<keyof typeof PAYMENT_BATCH_STATUS_LABELS, Tone> = { DRAFT: 'warning', PAID: 'success', CANCELLED: 'neutral' };

function formatDate(value: Date | null): string {
  return value ? value.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }) : '—';
}

export default async function PaymentBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [context, result] = await Promise.all([getAuthContext(), getPaymentBatchAction(id)]);
  if (!result.success) notFound();
  const batch = result.data;
  const canWrite = can(context, 'treasury:write');

  return (
    <div className="space-y-6">
      <Link href="/dashboard/treasury/payment-batches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Nóminas de pago
      </Link>
      <PageHeader
        eyebrow={`Nómina #${batch.folio}`}
        title={formatCurrency(batch.totalAmount)}
        description={
          <>
            {batch.items.length} factura{batch.items.length === 1 ? '' : 's'} · desde {batch.bankAccountName} · pago el {formatDate(batch.paymentDate)}
            {batch.paidAt && <> · pagada el {formatDate(batch.paidAt)}</>}
            {batch.notes && <> · {batch.notes}</>}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={TONE[batch.status]}>{PAYMENT_BATCH_STATUS_LABELS[batch.status]}</StatusBadge>
            <PaymentBatchActions batchId={batch.id} folio={batch.folio} status={batch.status} canWrite={canWrite} />
          </div>
        }
      />

      {batch.status === 'DRAFT' && batch.issues.length > 0 && (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft/50 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div>
            <p className="font-medium">El banco rechazará estas líneas si no las corriges:</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {batch.issues.map((issue, index) => (
                <li key={`${issue.name}-${index}`}>
                  {issue.name}: {issue.problem}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">Completa los datos bancarios en la ficha del proveedor (Clientes & Proveedores) y vuelve a descargar el archivo.</p>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-border bg-card shadow-card" aria-label="Detalle de la nómina">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 font-medium">Proveedor</th>
                <th className="px-4 py-2.5 font-medium">Documento</th>
                <th className="px-4 py-2.5 font-medium">Banco y cuenta</th>
                <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                {batch.status === 'DRAFT' && canWrite && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {batch.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">{item.file.rut}</p>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{item.label}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {item.file.bankCode ? (
                      <>
                        {bankName(item.file.bankCode)}
                        <span className="ml-1 font-mono text-xs">{item.file.accountNumber ?? '—'}</span>
                      </>
                    ) : (
                      <span className="text-warning">Sin datos bancarios</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(item.amount)}</td>
                  {batch.status === 'DRAFT' && canWrite && (
                    <td className="px-4 py-2.5 text-right">
                      <PaymentBatchActions batchId={batch.id} folio={batch.folio} status={batch.status} canWrite={canWrite} removeItemId={item.id} removeLabel={`${item.label} de ${item.file.name}`} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

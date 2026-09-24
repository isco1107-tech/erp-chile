import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import ContractActions from '@/components/contracts/ContractActions';
import { can, getAuthContext } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { BILLING_FREQUENCY_LABELS, contractPeriodNet, monthlyRecurringRevenue, periodLabel } from '@/lib/services/recurring-billing';
import { getContractAction } from '@/modules/contracts/actions/contracts.actions';
import { CONTRACT_STATUS_LABELS } from '@/modules/contracts/schema';
import { DTE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '@/modules/sales/schema';
import { asSalesPaymentMethod } from '@/modules/contracts/schema';

export const metadata = { title: 'Contrato' };

const STATUS_TONE = { ACTIVE: 'success', PAUSED: 'warning', ENDED: 'neutral' } as const;
const formatDate = (date: Date) => new Date(date).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getContractAction(id), getAuthContext()]);
  if (!result.success) notFound();
  const contract = result.data;
  const canWrite = can(context, 'contracts:write');
  const periodNet = contractPeriodNet(contract.lines);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/contracts" className={buttonVariants({ variant: 'outline' })}>
        <ArrowLeft aria-hidden="true" /> Contratos
      </Link>
      <PageHeader
        eyebrow="Contrato recurrente"
        title={contract.name}
        description={`${contract.contact.razonSocial} · ${formatRut(contract.contact.rut)}`}
        actions={
          canWrite ? (
            <ContractActions
              contractId={contract.id}
              status={contract.status}
              canBill={can(context, 'sales:write')}
              hasBillings={contract.billings.some((billing) => billing.status === 'GENERATED')}
              nextPeriodLabel={periodLabel(contract.nextBillingDate, contract.frequency)}
            />
          ) : undefined
        }
      />

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Estado</p>
          <StatusBadge tone={STATUS_TONE[contract.status]}>{CONTRACT_STATUS_LABELS[contract.status]}</StatusBadge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Frecuencia</p>
          <p className="font-medium">{BILLING_FREQUENCY_LABELS[contract.frequency]}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Próxima factura</p>
          <p className="font-medium">{contract.status === 'ACTIVE' ? `${formatDate(contract.nextBillingDate)} (${periodLabel(contract.nextBillingDate, contract.frequency)})` : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Vigencia</p>
          <p className="font-medium">
            {formatDate(contract.startDate)} → {contract.endDate ? formatDate(contract.endDate) : 'indefinida'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Documento</p>
          <p className="font-medium">{DTE_TYPE_LABELS[contract.dteType]}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pago</p>
          <p className="font-medium">
            {PAYMENT_METHOD_LABELS[asSalesPaymentMethod(contract.paymentMethod)]} · {contract.paymentTermDays} días
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Emisión</p>
          <p className="font-medium">{contract.autoIssue ? 'Automática' : 'Borrador para revisar'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Neto por período · mensual</p>
          <p className="font-medium tabular-nums">
            {formatCurrency(periodNet)} · {formatCurrency(monthlyRecurringRevenue(contract.lines, contract.frequency))}
          </p>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border">
        <h2 className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">Servicios del contrato</h2>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Descripción</th>
              <th className="px-4 py-2 text-right">Cantidad</th>
              <th className="px-4 py-2 text-right">Precio neto</th>
              <th className="px-4 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {contract.lines.map((line) => (
              <tr key={line.id} className="border-t border-border">
                <td className="px-4 py-2">
                  {line.description}
                  {(line.product?.isExempt ?? line.isExempt) && <span className="ml-2 text-xs text-muted-foreground">(exenta)</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{line.quantity}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(line.unitPrice)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(Math.round(line.quantity * line.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border">
        <h2 className="border-b border-border bg-muted/40 px-4 py-2 text-sm font-semibold">Historial de facturación</h2>
        {contract.billings.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Todavía no se factura ningún período.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Período</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {contract.billings.map((billing) => (
                <tr key={billing.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{billing.periodKey}</td>
                  <td className="px-4 py-2">{formatDate(billing.createdAt)}</td>
                  <td className="px-4 py-2">
                    {billing.salesDocument ? (
                      <Link href={`/dashboard/sales/${billing.salesDocument.id}`} className="hover:underline">
                        {DTE_TYPE_LABELS[billing.salesDocument.dteType]} {billing.salesDocument.folio ? `N° ${billing.salesDocument.folio}` : '(borrador)'}
                      </Link>
                    ) : (
                      <span className="text-xs text-danger">{billing.errorMessage ?? 'Sin documento'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{billing.salesDocument ? formatCurrency(billing.salesDocument.totalAmount) : '—'}</td>
                  <td className="px-4 py-2">
                    {billing.status === 'FAILED' ? (
                      <StatusBadge tone="danger">Falló</StatusBadge>
                    ) : billing.salesDocument?.status === 'DRAFT' ? (
                      <StatusBadge tone="warning">Borrador por emitir</StatusBadge>
                    ) : billing.salesDocument?.paymentStatus === 'PAID' ? (
                      <StatusBadge tone="success">Pagada</StatusBadge>
                    ) : (
                      <StatusBadge tone="info">Emitida</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {contract.notes && (
        <section className="rounded-xl border border-border p-4 text-sm">
          <p className="text-xs text-muted-foreground">Notas internas</p>
          <p className="whitespace-pre-wrap">{contract.notes}</p>
        </section>
      )}
    </div>
  );
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSponsorshipContractAction } from '@/modules/sponsorships/actions/sponsorships.actions';
import { SPONSORSHIP_STATUS_LABELS, SPONSORSHIP_TIER_LABELS } from '@/modules/sponsorships/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut } from '@/lib/chile/rut';
import { buttonVariants } from '@/components/ui/button';
import { can, getAuthContext } from '@/lib/auth/guards';
import DeliverableChecklist from '@/components/sponsorships/DeliverableChecklist';
import SponsorshipPaymentForm from '@/components/sponsorships/SponsorshipPaymentForm';
import DeleteSponsorshipContractButton from '@/components/sponsorships/DeleteSponsorshipContractButton';
import SponsorPortalLinkButton from '@/components/sponsorships/SponsorPortalLinkButton';
import AgreementSection from '@/components/sponsorships/AgreementSection';
import { getAgreementStatus } from '@/modules/sponsorships/services/sponsorships.service';

export const metadata = { title: 'Contrato de Auspicio' };

const STATUS_BADGE: Record<string, string> = {
  PROPOSAL: 'bg-muted text-muted-foreground',
  CONFIRMED: 'bg-blue-600/10 text-blue-600',
  COMPLETED: 'bg-green-600/10 text-green-600',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Pendiente de pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagado',
};

export default async function SponsorshipContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getSponsorshipContractAction(id), getAuthContext()]);
  if (!result.success) notFound();

  const contract = result.data;
  const canWrite = can(context, 'sponsorships:write');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/sponsorships" className={buttonVariants({ variant: 'outline' })}>
          ← Volver a Auspicios & Marcas
        </Link>
        {canWrite && (
          <div className="flex items-center gap-2">
            <SponsorPortalLinkButton contractId={contract.id} />
            <Link href={`/dashboard/sponsorships/${contract.id}/edit`} className={buttonVariants({ variant: 'default' })}>
              Editar contrato
            </Link>
            <DeleteSponsorshipContractButton contractId={contract.id} contactName={contract.contact.razonSocial} />
          </div>
        )}
      </div>

      <div className="mx-auto max-w-3xl space-y-6 rounded-xl border border-border bg-card p-8 text-sm text-foreground">
        <div className="flex items-start justify-between gap-6 border-b border-border pb-5">
          <div>
            <h2 className="text-lg font-bold">{contract.contact.razonSocial}</h2>
            <p className="text-muted-foreground">
              {formatRut(contract.contact.rut)} — {SPONSORSHIP_TIER_LABELS[contract.tier]}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[contract.status]}`}>
            {SPONSORSHIP_STATUS_LABELS[contract.status]}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded border border-border p-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Aporte en efectivo</p>
            <p className="text-base font-semibold">{formatCurrency(contract.cashAmount)}</p>
          </div>
          {contract.isBarter && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Valorización del canje</p>
              <p className="text-base font-semibold">{formatCurrency(contract.barterValuation)}</p>
              {contract.barterDescription && <p className="mt-1 text-xs text-muted-foreground">{contract.barterDescription}</p>}
            </div>
          )}
        </div>

        {contract.notes && (
          <p>
            <span className="font-medium text-foreground">Notas:</span> {contract.notes}
          </p>
        )}

        {contract.cashAmount > 0 && (
          <div className="rounded border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">Estado de pago</p>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                {PAYMENT_STATUS_LABEL[contract.paymentStatus]}
              </span>
            </div>
            <div className="mb-3 flex justify-between text-sm">
              <span>Pagado</span>
              <span>{formatCurrency(contract.paidAmount)}</span>
            </div>
            <div className="mb-3 flex justify-between text-sm font-medium">
              <span>Saldo pendiente</span>
              <span>{formatCurrency(Math.max(contract.cashAmount - contract.paidAmount, 0))}</span>
            </div>
            {canWrite && (
              <SponsorshipPaymentForm contractId={contract.id} cashAmount={contract.cashAmount} paidAmount={contract.paidAmount} />
            )}
          </div>
        )}

        <AgreementSection contractId={contract.id} status={getAgreementStatus(contract)} canWrite={canWrite} />
      </div>

      <div className="mx-auto max-w-3xl">
        <DeliverableChecklist contractId={contract.id} deliverables={contract.deliverables} canWrite={canWrite} />
      </div>
    </div>
  );
}

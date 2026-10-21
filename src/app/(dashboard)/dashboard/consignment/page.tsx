import Link from 'next/link';
import { Coins, FileText, Handshake, Package, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { buttonVariants } from '@/components/ui/button';
import ProducersClient from '@/components/consignment/ProducersClient';
import { formatCurrency } from '@/components/consignment/format';
import { can, getAuthContext } from '@/lib/auth/guards';
import { listProducers } from '@/modules/consignment/services/consignment.service';
import { getConsignmentOverview, listProducerCandidateContacts } from '@/modules/consignment/services/settlement.service';

export const metadata = { title: 'Productores y consignación' };

export default async function ConsignmentPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'consignment:write');
  const [producers, overview, candidates] = await Promise.all([
    listProducers(context.companyId),
    getConsignmentOverview(context.companyId),
    canWrite ? listProducerCandidateContacts(context.companyId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Productores y consignación"
        description="Productores que dejan sus productos en consignación: tu empresa vende, retiene una comisión y liquida al productor el resto."
        actions={
          <Link href="/dashboard/consignment/settlements" className={buttonVariants({ variant: 'outline' })}>
            <FileText className="size-4" aria-hidden="true" /> Liquidaciones
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Productores activos" value={String(overview.activeProducers)} icon={Handshake} />
        <KpiCard label="Productos en consignación" value={String(overview.consignmentProducts)} icon={Package} tone="info" />
        <KpiCard label="Pendiente de liquidar" value={formatCurrency(overview.pendingToSettle)} icon={Coins} tone="warning" />
        <KpiCard label="Liquidado, por pagar" value={formatCurrency(overview.confirmedUnpaid)} icon={Wallet} tone="danger" />
      </div>

      <ProducersClient producers={producers} pendingByProducer={overview.pendingByProducer} candidates={candidates} canWrite={canWrite} />
    </div>
  );
}

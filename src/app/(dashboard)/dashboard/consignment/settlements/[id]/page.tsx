import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import SettlementDetailClient from '@/components/consignment/SettlementDetailClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getSettlementDetail } from '@/modules/consignment/services/settlement.service';

export const metadata = { title: 'Liquidación de consignación' };

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const settlement = await getSettlementDetail(context.companyId, id);
  if (!settlement) notFound();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Liquidaciones"
        title={`Liquidación — ${settlement.producerName}`}
        actions={
          <Link href="/dashboard/consignment/settlements" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Volver
          </Link>
        }
      />
      <SettlementDetailClient settlement={settlement} canWrite={can(context, 'consignment:write')} />
    </div>
  );
}

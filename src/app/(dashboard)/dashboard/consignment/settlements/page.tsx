import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import SettlementsClient from '@/components/consignment/SettlementsClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { listProducers } from '@/modules/consignment/services/consignment.service';
import { listSettlements } from '@/modules/consignment/services/settlement.service';

export const metadata = { title: 'Liquidaciones de consignación' };

export default async function SettlementsPage() {
  const context = await getAuthContext();
  const [settlements, producers] = await Promise.all([listSettlements(context.companyId), listProducers(context.companyId)]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Productores y consignación"
        title="Liquidaciones"
        description="Lo que se le debe a cada productor por sus ventas del período: borrador, confirmada (genera la cuenta por pagar) y pagada."
        actions={
          <Link href="/dashboard/consignment" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Productores
          </Link>
        }
      />
      <SettlementsClient
        settlements={settlements}
        producers={producers.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.contactName }))}
        canWrite={can(context, 'consignment:write')}
      />
    </div>
  );
}

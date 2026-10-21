import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import ProducerDetailClient from '@/components/consignment/ProducerDetailClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getProducer, listAssignableProducts } from '@/modules/consignment/services/settlement.service';

export const metadata = { title: 'Productor' };

export default async function ProducerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const producer = await getProducer(context.companyId, id);
  if (!producer) notFound();
  const { assigned, available } = await listAssignableProducts(context.companyId, id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Productores y consignación"
        title={producer.contact.razonSocial}
        description={
          <span className="inline-flex items-center gap-2">
            {producer.contact.rut}
            <StatusBadge tone={producer.isActive ? 'success' : 'neutral'}>{producer.isActive ? 'Activo' : 'Inactivo'}</StatusBadge>
          </span>
        }
        actions={
          <Link href="/dashboard/consignment" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Volver
          </Link>
        }
      />
      <ProducerDetailClient
        producer={{
          id: producer.id,
          defaultCommissionBps: producer.defaultCommissionBps,
          commissionBase: producer.commissionBase,
          isActive: producer.isActive,
          notes: producer.notes,
          paymentNotes: producer.paymentNotes,
        }}
        assigned={assigned}
        available={available}
        canWrite={can(context, 'consignment:write')}
      />
    </div>
  );
}

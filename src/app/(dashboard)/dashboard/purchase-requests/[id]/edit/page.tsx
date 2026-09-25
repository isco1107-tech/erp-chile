import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import PurchaseRequestForm from '@/components/purchases/PurchaseRequestForm';
import { getPurchaseRequestAction } from '@/modules/purchases/actions/purchase-request.actions';

export const metadata = { title: 'Editar solicitud de compra' };

export default async function EditPurchaseRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPurchaseRequestAction(id);
  if (!result.success) notFound();
  const request = result.data;
  if (request.status !== 'DRAFT' && request.status !== 'REJECTED') redirect(`/dashboard/purchase-requests/${id}`);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Solicitud N° ${request.folio}`} title="Editar solicitud" description="Al guardar vuelve a borrador; envíala de nuevo a aprobación cuando esté lista." />
      <PurchaseRequestForm
        initial={{
          id: request.id,
          title: request.title,
          neededBy: request.neededBy ? new Date(request.neededBy).toISOString().slice(0, 10) : '',
          notes: request.notes ?? '',
          items: request.items,
        }}
      />
    </div>
  );
}

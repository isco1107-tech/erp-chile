import { notFound } from 'next/navigation';
import PurchaseRequestDetailClient from '@/components/purchases/PurchaseRequestDetailClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getPurchaseRequestAction } from '@/modules/purchases/actions/purchase-request.actions';

export const metadata = { title: 'Solicitud de compra' };

export default async function PurchaseRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const result = await getPurchaseRequestAction(id);
  if (!result.success) notFound();
  return (
    <PurchaseRequestDetailClient
      request={result.data}
      currentUserId={context.id}
      canApprove={can(context, 'purchases:approve')}
      canQuote={can(context, 'purchases:orders')}
      canManage={can(context, 'purchases:orders') || can(context, 'purchases:approve')}
    />
  );
}

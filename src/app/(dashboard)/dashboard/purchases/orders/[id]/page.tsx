import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { getPurchaseOrderAction } from '@/modules/purchases/actions/purchase-order.actions';
import { listGoodsReceiptsAction } from '@/modules/purchases/actions/goods-receipt.actions';
import PurchaseOrderDetailClient from '@/components/PurchaseOrderDetailClient';

export const metadata = { title: 'Orden de Compra' };

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [orderResult, receiptsResult] = await Promise.all([
    getPurchaseOrderAction(id),
    listGoodsReceiptsAction(id),
  ]);
  if (!orderResult.success) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/purchases/orders" className={buttonVariants({ variant: 'outline' })}>← Volver</Link>
      </div>
      <PurchaseOrderDetailClient order={orderResult.data} initialReceipts={receiptsResult.success ? receiptsResult.data : []} />
    </div>
  );
}

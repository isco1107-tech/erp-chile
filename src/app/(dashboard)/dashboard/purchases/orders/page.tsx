import PurchaseOrderHistoryClient from '@/components/PurchaseOrderHistoryClient';

export const metadata = { title: 'Órdenes de Compra' };

export default function PurchaseOrdersPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Órdenes de Compra</h1>
      <PurchaseOrderHistoryClient />
    </div>
  );
}

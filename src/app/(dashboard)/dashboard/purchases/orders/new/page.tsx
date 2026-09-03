import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import PurchaseOrderForm from '@/components/PurchaseOrderForm';

export const metadata = { title: 'Nueva Orden de Compra' };

export default async function NewPurchaseOrderPage() {
  const context = await getAuthContext();
  if (!can(context, 'purchases:orders')) redirect('/dashboard/purchases/orders');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nueva Orden de Compra</h1>
      <PurchaseOrderForm />
    </div>
  );
}

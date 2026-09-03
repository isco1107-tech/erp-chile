import PurchaseHistoryClient from '@/components/PurchaseHistoryClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Compras & Facturas de Proveedor' };

export default async function PurchasesPage() {
  const context = await getAuthContext();
  const canApprove = can(context, 'purchases:approve');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Compras & Facturas de Proveedor</h1>
      <PurchaseHistoryClient canApprove={canApprove} />
    </div>
  );
}

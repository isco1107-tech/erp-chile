import PurchaseHistoryClient from '@/components/PurchaseHistoryClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Compras & Facturas de Proveedor' };

export default async function PurchasesPage() {
  const context = await getAuthContext();
  const canApprove = can(context, 'purchases:approve');

  return (
    <div className="space-y-6">
      <PageHeader
        className="duration-500 animate-in fade-in slide-in-from-bottom-2"
        eyebrow="Compras"
        title="Compras & Facturas de Proveedor"
        description="Recepción de mercadería, facturas de proveedor y su estado de aprobación y pago."
      />
      <PurchaseHistoryClient canApprove={canApprove} />
    </div>
  );
}

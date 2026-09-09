import PurchaseHistoryClient from '@/components/PurchaseHistoryClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Compras & Facturas de Proveedor' };

export default async function PurchasesPage() {
  const context = await getAuthContext();
  const canApprove = can(context, 'purchases:approve');

  return (
    <div className="space-y-6">
      <div className="duration-500 animate-in fade-in slide-in-from-bottom-2">
        <h1 className="text-2xl font-semibold text-foreground">Compras & Facturas de Proveedor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recepción de mercadería, facturas de proveedor y su estado de aprobación y pago.
        </p>
      </div>
      <PurchaseHistoryClient canApprove={canApprove} />
    </div>
  );
}

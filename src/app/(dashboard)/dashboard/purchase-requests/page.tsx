import { PageHeader } from '@/components/ui/PageHeader';
import PurchaseRequestsClient from '@/components/purchases/PurchaseRequestsClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Solicitudes de compra' };

export default async function PurchaseRequestsPage() {
  const context = await getAuthContext();
  const scopeAll = can(context, 'purchases:orders') || can(context, 'purchases:approve');
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="Solicitudes de compra"
        description={
          scopeAll
            ? 'Lo que pide el equipo: apruébalo, cotízalo con varios proveedores y genera las órdenes de compra por mejor precio desde el comparativo.'
            : 'Pide lo que necesitas comprar. Jefatura lo aprueba y compras lo cotiza; aquí ves en qué va.'
        }
      />
      <PurchaseRequestsClient scopeAll={scopeAll} />
    </div>
  );
}

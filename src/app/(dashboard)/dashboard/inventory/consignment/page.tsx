import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import ConsignmentClient from '@/components/inventory/ConsignmentClient';

export const metadata = { title: 'Consignación' };

export default async function ConsignmentPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Consignación"
        description="Mercadería de sellers: es de ellos hasta que se vende. Aquí ves su stock, recibes y devuelves mercadería, y les liquidas lo vendido menos tu comisión."
      />
      <ConsignmentClient
        canMoveStock={can(context, 'inventory:write')}
        canSeeSettlements={can(context, 'consignment:read')}
        canManageSettlements={can(context, 'consignment:write')}
      />
    </div>
  );
}

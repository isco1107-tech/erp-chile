import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import PriceListsClient from '@/components/sales/PriceListsClient';
import { listPriceLists } from '@/modules/sales/services/price-lists.service';

export const metadata = { title: 'Listas de precios' };

export default async function PriceListsPage() {
  const context = await getAuthContext();
  const lists = await listPriceLists(context.companyId);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ventas"
        title="Listas de precios"
        description="Precios distintos por tipo de cliente y por volumen. Se asignan a cada cliente y se proponen solos al vender."
      />
      <PriceListsClient lists={lists} canWrite={can(context, 'sales:write')} />
    </div>
  );
}

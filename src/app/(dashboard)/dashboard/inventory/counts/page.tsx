import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import InventoryCountsClient from '@/components/inventory/InventoryCountsClient';
import { listInventoryCountsAction } from '@/modules/inventory/actions/inventory-count.actions';
import { listWarehousesAction } from '@/modules/inventory/actions/inventory.actions';
import { listCategoriesAction } from '@/modules/inventory/actions/products.actions';

export const metadata = { title: 'Toma de inventario' };

export default async function InventoryCountsPage() {
  const context = await getAuthContext();
  const [counts, warehouses, categories] = await Promise.all([listInventoryCountsAction(), listWarehousesAction(), listCategoriesAction()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Toma de inventario"
        description="Cuenta lo que hay en bodega —a mano o con lector de códigos— y ajusta el stock a lo contado, con su asiento al costo PMP."
      />
      <InventoryCountsClient
        counts={counts.success ? counts.data : []}
        warehouses={warehouses.success ? warehouses.data.map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault })) : []}
        categories={categories.success ? categories.data.map((c) => ({ id: c.id, name: c.name })) : []}
        canWrite={can(context, 'inventory:write')}
      />
    </div>
  );
}

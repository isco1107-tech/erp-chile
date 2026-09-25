import { PageHeader } from '@/components/ui/PageHeader';
import ProductionOrdersClient from '@/components/manufacturing/ProductionOrdersClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { listBomsAction } from '@/modules/manufacturing/actions/manufacturing.actions';

export const metadata = { title: 'Producción' };

export default async function ManufacturingPage() {
  const context = await getAuthContext();
  const [boms, warehouses] = await Promise.all([
    listBomsAction(),
    prisma.warehouse.findMany({ where: { companyId: context.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Producción"
        description="Órdenes de producción que consumen insumos según su receta y dejan el producto terminado en bodega a su costo real (insumos al PMP + mano de obra)."
      />
      <ProductionOrdersClient
        canWrite={can(context, 'manufacturing:write')}
        boms={(boms.success ? boms.data : []).filter((bom) => bom.isActive).map((bom) => ({ id: bom.id, name: bom.name, productName: bom.productName, unit: bom.unit, outputQuantity: bom.outputQuantity }))}
        warehouses={warehouses}
      />
    </div>
  );
}

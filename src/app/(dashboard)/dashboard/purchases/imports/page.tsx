import { PageHeader } from '@/components/ui/PageHeader';
import ImportShipmentsClient from '@/components/purchases/ImportShipmentsClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { listImportShipmentsAction } from '@/modules/purchases/actions/import-shipment.actions';

export const metadata = { title: 'Importaciones' };

export default async function ImportShipmentsPage() {
  const context = await getAuthContext();
  const [rows, suppliers, warehouses] = await Promise.all([
    listImportShipmentsAction(),
    prisma.contact.findMany({ where: { companyId: context.companyId, isSupplier: true }, orderBy: { razonSocial: 'asc' }, select: { id: true, razonSocial: true, rut: true } }),
    prisma.warehouse.findMany({ where: { companyId: context.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="Importaciones"
        description="Carpetas de importación con costeo: valor FOB, tipo de cambio, flete, seguro, derechos, agente y puerto se reparten entre los productos para ingresarlos a bodega a su costo real."
      />
      <ImportShipmentsClient
        rows={rows.success ? rows.data : []}
        canWrite={can(context, 'purchases:orders')}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, label: `${supplier.razonSocial} · ${supplier.rut}` }))}
        warehouses={warehouses}
      />
    </div>
  );
}

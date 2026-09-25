import { notFound } from 'next/navigation';
import ImportShipmentDetailClient from '@/components/purchases/ImportShipmentDetailClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { getImportShipmentAction, listPurchaseDocumentOptionsAction } from '@/modules/purchases/actions/import-shipment.actions';

export const metadata = { title: 'Carpeta de importación' };

export default async function ImportShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const [result, documents, suppliers, warehouses] = await Promise.all([
    getImportShipmentAction(id),
    listPurchaseDocumentOptionsAction(),
    prisma.contact.findMany({ where: { companyId: context.companyId, isSupplier: true }, orderBy: { razonSocial: 'asc' }, select: { id: true, razonSocial: true, rut: true } }),
    prisma.warehouse.findMany({ where: { companyId: context.companyId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  if (!result.success) notFound();
  // El PMP vigente solo lo ve quien puede ver costos.
  const shipment = can(context, 'products:costs') ? result.data : { ...result.data, items: result.data.items.map((item) => ({ ...item, currentPmp: 0 })) };
  return (
    <ImportShipmentDetailClient
      shipment={shipment}
      canWrite={can(context, 'purchases:orders')}
      suppliers={suppliers.map((supplier) => ({ id: supplier.id, label: `${supplier.razonSocial} · ${supplier.rut}` }))}
      warehouses={warehouses}
      purchaseDocuments={documents.success ? documents.data : []}
    />
  );
}

import { notFound, redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getPurchaseDocumentAction } from '@/modules/purchases/actions/purchases.actions';
import PurchaseDocumentForm from '@/components/PurchaseDocumentForm';

export const metadata = { title: 'Editar Borrador de Compra' };

export default async function EditPurchaseDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'purchases:write')) redirect('/dashboard/purchases');

  const result = await getPurchaseDocumentAction(id);
  if (!result.success) notFound();
  // Solo un borrador admite edición: una vez emitido, sus efectos de
  // stock/PMP ya se aplicaron y editarlo retroactivamente los dejaría
  // desalineados con lo que en verdad ocurrió en bodega.
  if (result.data.status !== 'DRAFT') redirect(`/dashboard/purchases/${id}`);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Editar Borrador de Compra</h1>
      <PurchaseDocumentForm editingDocument={result.data} />
    </div>
  );
}

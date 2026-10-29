import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import PurchaseDocumentForm from '@/components/PurchaseDocumentForm';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata = { title: 'Nueva Factura de Proveedor' };

export default async function NewPurchaseDocumentPage() {
  // El guard vive también aquí y no solo en la Server Action: sin esto un rol
  // sin `purchases:write` llenaba el documento completo para recibir un 403 al
  // guardar. Se usa `can` y no una lista de roles para que respete los roles
  // personalizados de la empresa. El layout del módulo ya cubrió el feature gate.
  const context = await getAuthContext();
  if (!can(context, 'purchases:write')) redirect('/dashboard/purchases');

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Compras" title="Registrar Factura de Proveedor" description="Al registrarla entra la mercadería a bodega y se actualiza el costo promedio de cada producto." />
      <PurchaseDocumentForm />
    </div>
  );
}

import { PageHeader } from '@/components/ui/PageHeader';
import PurchaseRequestForm from '@/components/purchases/PurchaseRequestForm';

export const metadata = { title: 'Nueva solicitud de compra' };

export default function NewPurchaseRequestPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Compras · Solicitudes" title="Nueva solicitud de compra" description="Describe qué se necesita y para cuándo. Puedes guardarla como borrador o enviarla directo a aprobación." />
      <PurchaseRequestForm />
    </div>
  );
}

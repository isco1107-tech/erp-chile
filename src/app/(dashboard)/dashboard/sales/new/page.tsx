import SalesDocumentForm from '@/components/SalesDocumentForm';

export const metadata = { title: 'Nueva Venta' };

export default function NewSalesDocumentPage() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nueva Venta / Facturador</h1>
      <SalesDocumentForm />
    </div>
  );
}

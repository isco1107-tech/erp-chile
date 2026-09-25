import SalesDocumentForm from '@/components/SalesDocumentForm';
import { DTE_TYPES } from '@/modules/sales/schema';

export const metadata = { title: 'Nueva Venta' };

type DteTypeParam = (typeof DTE_TYPES)[number];

export default async function NewSalesDocumentPage({ searchParams }: { searchParams: Promise<{ orderId?: string; type?: string }> }) {
  const { orderId, type } = await searchParams;
  const initialType = DTE_TYPES.includes(type as DteTypeParam) ? (type as DteTypeParam) : undefined;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{orderId ? 'Emitir desde nota de venta' : 'Nueva Venta / Facturador'}</h1>
      <SalesDocumentForm orderId={orderId} initialType={initialType} />
    </div>
  );
}

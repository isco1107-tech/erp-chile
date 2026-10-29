import SalesDocumentForm from '@/components/SalesDocumentForm';
import { DTE_TYPES } from '@/modules/sales/schema';

export const metadata = { title: 'Nueva Venta' };

type DteTypeParam = (typeof DTE_TYPES)[number];

export default async function NewSalesDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; type?: string; borrador?: string; corrige?: string }>;
}) {
  const { orderId, type, borrador, corrige } = await searchParams;
  const initialType = DTE_TYPES.includes(type as DteTypeParam) ? (type as DteTypeParam) : undefined;
  const title = orderId
    ? 'Emitir desde nota de venta'
    : borrador
      ? 'Continuar borrador'
      : corrige
        ? 'Emitir nota de crédito'
        : 'Nueva Venta / Facturador';
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <SalesDocumentForm orderId={orderId} initialType={initialType} draftId={borrador} creditFromId={corrige} />
    </div>
  );
}

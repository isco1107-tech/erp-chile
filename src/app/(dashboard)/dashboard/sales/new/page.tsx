import SalesDocumentForm from '@/components/SalesDocumentForm';
import { DTE_TYPES } from '@/modules/sales/schema';
import { PageHeader } from '@/components/ui/PageHeader';

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
    <div className="space-y-4">
      <PageHeader eyebrow="Ventas" title={title} />
      <SalesDocumentForm orderId={orderId} initialType={initialType} draftId={borrador} creditFromId={corrige} />
    </div>
  );
}

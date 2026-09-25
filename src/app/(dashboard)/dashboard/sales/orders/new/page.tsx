import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import SalesOrderForm from '@/components/sales/SalesOrderForm';

export const metadata = { title: 'Nueva nota de venta' };

export default async function NewSalesOrderPage({ searchParams }: { searchParams: Promise<{ quoteId?: string }> }) {
  const context = await getAuthContext();
  if (!can(context, 'sales:write')) redirect('/dashboard/sales/orders');
  const { quoteId } = await searchParams;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ventas" title="Nueva nota de venta" description="Registra el pedido del cliente. Después lo facturas o despachas completo o por partes." />
      <SalesOrderForm quoteId={quoteId} />
    </div>
  );
}

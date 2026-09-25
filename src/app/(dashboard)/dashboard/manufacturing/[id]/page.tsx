import { notFound } from 'next/navigation';
import ProductionOrderClient from '@/components/manufacturing/ProductionOrderClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getProductionOrderAction } from '@/modules/manufacturing/actions/manufacturing.actions';

export const metadata = { title: 'Orden de producción' };

export default async function ProductionOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  const result = await getProductionOrderAction(id);
  if (!result.success) notFound();
  return <ProductionOrderClient order={result.data} canWrite={can(context, 'manufacturing:write')} showCosts={can(context, 'products:costs')} />;
}

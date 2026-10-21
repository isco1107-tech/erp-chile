import { requireAuthWithPermission } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import WarehouseReviewClient from '@/components/inventory/mobile/WarehouseReviewClient';
export const metadata = { title: 'Revisión de bodega móvil' };
export default async function WarehouseReviewPage() {
  const context = await requireAuthWithPermission('inventory:approve');
  return <div className="space-y-6"><PageHeader title="Revisión de bodega" description="Registros del equipo, ajustes y diferencias de inventario." /><WarehouseReviewClient canSeeCosts={context.permissions.includes('products:costs')} /></div>;
}

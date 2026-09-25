import { AlertOctagon, CalendarClock } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { formatCurrency } from '@/lib/chile/tax';
import LotsClient from '@/components/inventory/LotsClient';
import { getExpirySummaryAction } from '@/modules/inventory/actions/inventory-count.actions';
import { listWarehousesAction } from '@/modules/inventory/actions/inventory.actions';
import { EXPIRY_SOON_DAYS } from '@/modules/inventory/services/lots.service';

export const metadata = { title: 'Lotes y vencimientos' };

export default async function LotsPage() {
  const context = await getAuthContext();
  const canSeeCosts = can(context, 'products:costs');
  const [summary, warehouses] = await Promise.all([getExpirySummaryAction(), listWarehousesAction()]);
  const data = summary.success ? summary.data : { expiredLots: 0, soonLots: 0, expiredValue: 0, soonValue: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Lotes y vencimientos"
        description="Saldo por lote de los productos que llevan lotes. Las salidas consumen primero el lote que vence antes (FEFO)."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label="Lotes vencidos con saldo"
          value={String(data.expiredLots)}
          icon={AlertOctagon}
          tone={data.expiredLots > 0 ? 'danger' : 'neutral'}
          hint={canSeeCosts && data.expiredValue > 0 ? `${formatCurrency(data.expiredValue)} al costo` : 'Retíralos de la venta'}
        />
        <KpiCard
          label={`Por vencer (${EXPIRY_SOON_DAYS} días)`}
          value={String(data.soonLots)}
          icon={CalendarClock}
          tone={data.soonLots > 0 ? 'warning' : 'neutral'}
          hint={canSeeCosts && data.soonValue > 0 ? `${formatCurrency(data.soonValue)} al costo` : 'Priorízalos en la venta'}
        />
      </div>
      <LotsClient
        warehouses={warehouses.success ? warehouses.data.map((w) => ({ id: w.id, name: w.name })) : []}
        canSeeCosts={canSeeCosts}
        initialFilter={data.expiredLots > 0 ? 'expired' : data.soonLots > 0 ? 'soon' : 'all'}
      />
    </div>
  );
}

import Link from 'next/link';
import { CalendarClock, ClipboardList, Wallet } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { buttonVariants } from '@/components/ui/button';
import SalesOrdersClient from '@/components/sales/SalesOrdersClient';
import { getSalesOrderSummary } from '@/modules/sales/services/sales-orders.service';
import { formatCurrency } from '@/lib/chile/tax';

export const metadata = { title: 'Notas de venta' };

export default async function SalesOrdersPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'sales:write');
  const summary = await getSalesOrderSummary(context.companyId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ventas"
        title="Notas de venta"
        description="Pedidos de clientes: reservan stock mientras están abiertos y se facturan o despachan por partes."
        actions={
          canWrite ? (
            <Link href="/dashboard/sales/orders/new" className={buttonVariants()}>
              Nueva nota de venta
            </Link>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Notas abiertas" value={String(summary.open)} icon={ClipboardList} tone="info" hint="Pendientes o en proceso" />
        <KpiCard label="Por facturar" value={formatCurrency(summary.pendingAmount)} icon={Wallet} tone="accent" hint="Saldo de las notas abiertas" />
        <KpiCard
          label="Entregas atrasadas"
          value={String(summary.overdueDeliveries)}
          icon={CalendarClock}
          tone={summary.overdueDeliveries > 0 ? 'danger' : 'neutral'}
          hint="Con fecha de entrega vencida"
        />
      </div>
      <SalesOrdersClient canWrite={canWrite} />
    </div>
  );
}

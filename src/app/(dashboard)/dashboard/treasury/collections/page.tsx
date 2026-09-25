import { AlarmClock, AlertOctagon, HandCoins, Wallet } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { formatCurrency } from '@/lib/chile/tax';
import { emptyAging } from '@/lib/treasury/collections';
import CollectionsClient from '@/components/treasury/CollectionsClient';
import { getCollectionSettingsAction, getCollectionsOverviewAction } from '@/modules/treasury/actions/collections.actions';

export const metadata = { title: 'Cobranza' };

export default async function CollectionsPage() {
  const context = await getAuthContext();
  const [overview, settings] = await Promise.all([getCollectionsOverviewAction(), getCollectionSettingsAction()]);
  const data = overview.success ? overview.data : { totals: emptyAging(), customers: [], promisesDueToday: 0, brokenPromises: 0 };
  const { totals } = data;
  const overduePct = totals.total > 0 ? Math.round((totals.overdue / totals.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tesorería"
        title="Cobranza"
        description="Antigüedad de la deuda por cliente, gestiones y promesas de pago, y recordatorios automáticos por correo."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Por cobrar" value={formatCurrency(totals.total)} icon={Wallet} tone="info" hint={`${data.customers.length} cliente${data.customers.length === 1 ? '' : 's'} con saldo`} />
        <KpiCard label="Vencido" value={formatCurrency(totals.overdue)} icon={AlarmClock} tone={totals.overdue > 0 ? 'warning' : 'success'} hint={`${overduePct}% de la cartera`} />
        <KpiCard label="Más de 90 días" value={formatCurrency(totals.d90_plus)} icon={AlertOctagon} tone={totals.d90_plus > 0 ? 'danger' : 'neutral'} hint="Riesgo de incobrable" />
        <KpiCard
          label="Promesas de pago"
          value={String(data.promisesDueToday)}
          icon={HandCoins}
          tone={data.brokenPromises > 0 ? 'danger' : 'accent'}
          hint={data.brokenPromises > 0 ? `${data.brokenPromises} incumplida${data.brokenPromises === 1 ? '' : 's'}` : 'Comprometidas para hoy'}
        />
      </div>
      <CollectionsClient
        overview={data}
        settings={settings.success ? settings.data : { enabled: false, days: [] }}
        canWrite={can(context, 'treasury:write')}
      />
    </div>
  );
}

import { Suspense } from 'react';
import ModuleGate from '@/components/ModuleGate';
import AccountingTabs from '@/components/accounting/AccountingTabs';
import { ChartSetupNotice } from '@/components/accounting/ChartSetupNotice';
import { can, getAuthContext } from '@/lib/auth/guards';
import { hasChartOfAccounts } from '@/modules/accounting/services/chart-setup.service';

/**
 * Libros contables. La puerta del módulo cubre todas las subrutas; cada
 * página vuelve a exigir `accounting:view` al cargar sus datos. Si la
 * contabilidad está activa pero sin plan de cuentas, se avisa arriba: sin él
 * el motor no registra asientos y los libros aparecerían vacíos sin razón.
 */
export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  const needsChart = context.features.hasAccounting && can(context, 'accounting:view') && !(await hasChartOfAccounts(context.companyId));

  return (
    <ModuleGate moduleKey="hasAccounting" permission="accounting:view">
      <div className="space-y-6">
        <Suspense fallback={<div className="h-11 border-b border-border" />}>
          <AccountingTabs />
        </Suspense>
        {needsChart && <ChartSetupNotice canInitialize={can(context, 'accounting:manage_accounts')} />}
        {children}
      </div>
    </ModuleGate>
  );
}

import ModuleGate from '@/components/ModuleGate';
import FinancialStatementsClient from '@/components/accounting/FinancialStatementsClient';
import { ChartSetupNotice } from '@/components/accounting/ChartSetupNotice';
import { can, getAuthContext } from '@/lib/auth/guards';
import { hasChartOfAccounts } from '@/modules/accounting/services/chart-setup.service';

export const metadata = { title: 'Estados Financieros' };

export default async function FinancialStatementsPage() {
  const context = await getAuthContext();
  const needsChart = context.features.hasAccounting && can(context, 'reports:financial') && !(await hasChartOfAccounts(context.companyId));

  return (
    <ModuleGate moduleKey="hasAccounting" permission="reports:financial">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Estados Financieros</h1>
        {needsChart && <ChartSetupNotice canInitialize={can(context, 'accounting:manage_accounts')} />}
        <FinancialStatementsClient />
      </div>
    </ModuleGate>
  );
}

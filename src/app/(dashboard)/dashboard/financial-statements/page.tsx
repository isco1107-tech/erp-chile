import ModuleGate from '@/components/ModuleGate';
import FinancialStatementsClient from '@/components/accounting/FinancialStatementsClient';

export const metadata = { title: 'Estados Financieros' };

export default function FinancialStatementsPage() {
  return (
    <ModuleGate moduleKey="hasAccounting" permission="reports:financial">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold" data-tutorial="module-header">Estados Financieros</h1>
        <FinancialStatementsClient />
      </div>
    </ModuleGate>
  );
}

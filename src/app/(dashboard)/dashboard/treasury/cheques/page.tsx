import { AlertOctagon, CalendarClock, FileCheck2, Send } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { formatCurrency } from '@/lib/chile/tax';
import ChequesClient from '@/components/treasury/ChequesClient';
import { getChequeSummaryAction } from '@/modules/treasury/actions/cheques.actions';
import { listBankAccountsAction } from '@/modules/treasury/actions/banks.actions';

export const metadata = { title: 'Cheques' };

export default async function ChequesPage() {
  const context = await getAuthContext();
  const [summary, accounts] = await Promise.all([getChequeSummaryAction(), listBankAccountsAction()]);
  const data = summary.success
    ? summary.data
    : { portfolioCount: 0, portfolioAmount: 0, dueNowCount: 0, dueNowAmount: 0, bouncedCount: 0, bouncedAmount: 0, issuedOutstandingCount: 0, issuedOutstandingAmount: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tesorería"
        title="Cheques"
        description="Cartera de cheques recibidos (también a fecha) y cheques girados a proveedores. Deposítalos, márcalos cobrados o protéstalos: el documento se actualiza solo."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="En cartera" value={formatCurrency(data.portfolioAmount)} icon={FileCheck2} tone="info" hint={`${data.portfolioCount} cheque${data.portfolioCount === 1 ? '' : 's'} recibidos`} />
        <KpiCard label="Para depositar hoy" value={formatCurrency(data.dueNowAmount)} icon={CalendarClock} tone={data.dueNowCount > 0 ? 'warning' : 'neutral'} hint={`${data.dueNowCount} ya cobrable${data.dueNowCount === 1 ? '' : 's'}`} />
        <KpiCard label="Protestados" value={formatCurrency(data.bouncedAmount)} icon={AlertOctagon} tone={data.bouncedCount > 0 ? 'danger' : 'neutral'} hint={`${data.bouncedCount} por recuperar`} />
        <KpiCard label="Girados sin cobrar" value={formatCurrency(data.issuedOutstandingAmount)} icon={Send} tone="accent" hint={`${data.issuedOutstandingCount} a proveedores`} />
      </div>
      <ChequesClient bankAccounts={accounts.success ? accounts.data.map((account) => ({ id: account.id, name: account.name, isDefault: account.isDefault })) : []} canWrite={can(context, 'treasury:write')} />
    </div>
  );
}

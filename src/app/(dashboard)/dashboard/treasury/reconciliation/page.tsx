import { PageHeader } from '@/components/ui/PageHeader';
import ReconciliationClient from '@/components/treasury/ReconciliationClient';
import { can, getAuthContext } from '@/lib/auth/guards';
import { listTreasuryAccountOptions } from '@/modules/treasury/services/accounts.service';

export const metadata = { title: 'Conciliación Bancaria' };

export default async function BankReconciliationPage() {
  const context = await getAuthContext();
  const accounts = can(context, 'bank:reconcile') ? (await listTreasuryAccountOptions(context.companyId)).filter((account) => account.type === 'BANK') : [];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tesorería"
        title="Conciliación Bancaria"
        description="Importa la cartola de tu banco y confirma que cada movimiento esté registrado: el sistema sugiere el cobro, pago o factura que calza."
      />
      <ReconciliationClient accounts={accounts.map(({ id, name }) => ({ id, name }))} />
    </div>
  );
}

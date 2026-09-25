import { can, getAuthContext } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import BankAccountsClient from '@/components/treasury/BankAccountsClient';
import { listBankAccountsAction } from '@/modules/treasury/actions/banks.actions';

export const metadata = { title: 'Bancos y conciliación' };

export default async function BanksPage() {
  const context = await getAuthContext();
  const result = await listBankAccountsAction(true);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tesorería"
        title="Bancos y conciliación"
        description="Tus cuentas bancarias, con su saldo según el banco y según tus registros. Importa la cartola y el sistema concilia solo lo que calza."
      />
      <BankAccountsClient accounts={result.success ? result.data : []} canWrite={can(context, 'treasury:write')} />
    </div>
  );
}

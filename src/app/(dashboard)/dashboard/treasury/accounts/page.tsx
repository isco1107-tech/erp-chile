import { PageHeader } from '@/components/ui/PageHeader';
import TreasuryAccountsClient from '@/components/treasury/TreasuryAccountsClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Cajas & Bancos' };

export default async function TreasuryAccountsPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tesorería"
        title="Cajas & Bancos"
        description="Dónde está tu dinero: saldo al día de cada caja y cuenta bancaria, con todo lo que entra y sale desde cualquier módulo."
      />
      <TreasuryAccountsClient canWrite={can(context, 'treasury:write')} />
    </div>
  );
}

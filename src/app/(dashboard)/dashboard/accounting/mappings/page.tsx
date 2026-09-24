import { PageHeader } from '@/components/ui/PageHeader';
import MappingsClient from '@/components/accounting/MappingsClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Cuentas del Sistema' };

export default async function AccountMappingsPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Contabilidad" title="Cuentas del Sistema" description="A qué cuenta de tu plan va cada asiento automático." />
      <MappingsClient canEdit={can(context, 'accounting:manage_accounts')} />
    </div>
  );
}

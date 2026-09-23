import { PageHeader } from '@/components/ui/PageHeader';
import { CrmPeopleClient } from '@/components/crm/CrmPeopleClient';
import { CrmTabs } from '@/components/crm/CrmTabs';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'CRM · Contactos comerciales' };

export default async function CrmPeoplePage() {
  const context = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM comercial"
        title="Contactos comerciales"
        description="Las personas detrás de cada marca: gerentes de marketing, agencias y productores, con sus datos de contacto y negocios."
      />
      <CrmTabs />
      <CrmPeopleClient canWrite={can(context, 'crm:write')} />
    </div>
  );
}

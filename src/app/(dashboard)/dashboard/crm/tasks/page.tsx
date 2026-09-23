import { PageHeader } from '@/components/ui/PageHeader';
import { CrmTabs } from '@/components/crm/CrmTabs';
import { CrmTasksClient } from '@/components/crm/CrmTasksClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'CRM · Agenda comercial' };

export default async function CrmTasksPage() {
  const context = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM comercial"
        title="Agenda comercial"
        description="Llamadas, reuniones, correos y tareas de seguimiento de todos tus negocios, ordenadas por urgencia."
      />
      <CrmTabs />
      <CrmTasksClient canWrite={can(context, 'crm:write')} />
    </div>
  );
}

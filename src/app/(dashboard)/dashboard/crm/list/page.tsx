import { PageHeader } from '@/components/ui/PageHeader';
import { CrmListClient } from '@/components/crm/CrmListClient';
import { CrmTabs } from '@/components/crm/CrmTabs';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'CRM · Lista de oportunidades' };

export default async function CrmListPage() {
  const context = await getAuthContext();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM comercial"
        title="Lista de oportunidades"
        description="Todos los negocios, abiertos y cerrados, ordenables por monto, probabilidad o fecha de cierre, con alertas de riesgo y exportación a Excel."
      />
      <CrmTabs />
      <CrmListClient canWrite={can(context, 'crm:write')} />
    </div>
  );
}

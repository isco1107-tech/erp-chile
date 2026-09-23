import { PageHeader } from '@/components/ui/PageHeader';
import { CrmReportsClient } from '@/components/crm/CrmReportsClient';
import { CrmTabs } from '@/components/crm/CrmTabs';

export const metadata = { title: 'CRM · Reportes comerciales' };

export default function CrmReportsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM comercial"
        title="Reportes comerciales"
        description="Pronóstico por mes, rendimiento por tipo de negocio, certamen, origen y responsable, y los motivos por los que se pierden negocios."
      />
      <CrmTabs />
      <CrmReportsClient />
    </div>
  );
}

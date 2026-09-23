import { PageHeader } from '@/components/ui/PageHeader';
import { PackagesClient } from '@/components/sponsorships/PackagesClient';
import { can, requireAuthWithPermission } from '@/lib/auth/guards';
import { listProjectsForSelect } from '@/modules/sponsorships/services/sponsorships.service';

export const metadata = { title: 'Tarifario de auspicios' };

export default async function SponsorshipPackagesPage() {
  const context = await requireAuthWithPermission('sponsorships:read');
  const projects = await listProjectsForSelect(context.companyId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Auspicios & Marcas"
        title="Tarifario de auspicios"
        description="Los planes que ofreces a las marcas en cada certamen: nivel, precio, cupos y beneficios. Se usan en el CRM, en el sitio público y al convertir un negocio ganado en contrato."
      />
      <PackagesClient projects={projects} canWrite={can(context, 'sponsorships:write')} />
    </div>
  );
}

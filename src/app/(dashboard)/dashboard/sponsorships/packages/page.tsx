import { PageHeader } from '@/components/ui/PageHeader';
import { PackagesClient } from '@/components/sponsorships/PackagesClient';
import { can, checkPageAccess } from '@/lib/auth/guards';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import { listProjectsForSelect } from '@/modules/sponsorships/services/sponsorships.service';

export const metadata = { title: 'Tarifario de auspicios' };

export default async function SponsorshipPackagesPage() {
  const access = await checkPageAccess('sponsorships:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const context = access.context;
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

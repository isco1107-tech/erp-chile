import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { PublicSiteForm } from '@/components/projects/PublicSiteForm';
import { can, requireAuthWithPermission } from '@/lib/auth/guards';
import { getProject } from '@/modules/projects/services/projects.service';

export const metadata = { title: 'Sitio público del certamen' };

export default async function ProjectPublicSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireAuthWithPermission('projects:read');
  const project = await getProject(context.companyId, id);
  if (!project) notFound();

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/projects/${project.id}`} className={buttonVariants({ variant: 'outline' })}>
        ← Volver al centro de mando
      </Link>
      <PageHeader
        eyebrow={project.name}
        title="Sitio público del certamen"
        description="La página oficial del certamen para el público, las marcas y las postulantes: portada con cuenta regresiva, candidatas, auspiciadores, entradas, votación y resultados."
      />
      <PublicSiteForm project={project} canWrite={can(context, 'projects:write')} />
    </div>
  );
}

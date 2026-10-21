import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { PublicSiteForm } from '@/components/projects/PublicSiteForm';
import { DevicePreview } from '@/components/projects/DevicePreview';
import { PastWinnersEditor } from '@/components/projects/PastWinnersEditor';
import { can, checkPageAccess } from '@/lib/auth/guards';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import { getProject } from '@/modules/projects/services/projects.service';
import { listPastWinners } from '@/modules/projects/services/past-winners.service';

export const metadata = { title: 'Sitio público del certamen' };

export default async function ProjectPublicSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkPageAccess('projects:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const context = access.context;
  const project = await getProject(context.companyId, id);
  if (!project) notFound();
  const winners = await listPastWinners(context.companyId, id);

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
      <DevicePreview projectId={project.id} />
      <PastWinnersEditor
        projectId={project.id}
        winners={winners.map((w) => ({ id: w.id, name: w.name, title: w.title, year: w.year, note: w.note, photoUrl: w.photoUrl, featured: w.featured }))}
        canWrite={can(context, 'projects:write')}
      />
    </div>
  );
}

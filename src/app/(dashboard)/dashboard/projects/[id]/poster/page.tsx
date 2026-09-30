import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { PosterGenerator } from '@/components/projects/PosterGenerator';
import { checkPageAccess } from '@/lib/auth/guards';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import { getProject } from '@/modules/projects/services/projects.service';
import { PUBLIC_ACCENTS, type PublicAccentKey } from '@/modules/projects/schema';

export const metadata = { title: 'Afiche de convocatoria' };

export default async function ProjectPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkPageAccess('projects:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const project = await getProject(access.context.companyId, id);
  if (!project) notFound();

  const accent = ((PUBLIC_ACCENTS as readonly string[]).includes(project.publicAccent) ? project.publicAccent : 'gold') as PublicAccentKey;
  // Mismo marcador que usa la ruta del afiche: sin dominio propio ni dirección pública, no hay enlace real que ofrecer.
  const hasPublicUrl = Boolean(project.publicSiteEnabled && project.publicSlug);

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/projects/${project.id}`} className={buttonVariants({ variant: 'outline' })}>
        ← Volver al centro de mando
      </Link>
      <PageHeader eyebrow={project.name} title="Afiche de convocatoria" description="Imagen lista para Instagram (feed, story o cuadrado), armada con los datos reales del certamen." />
      <PosterGenerator projectId={project.id} defaultAccent={accent} hasPublicUrl={hasPublicUrl} />
    </div>
  );
}

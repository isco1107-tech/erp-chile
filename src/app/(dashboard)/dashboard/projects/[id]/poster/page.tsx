import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { PosterStudio } from '@/components/projects/PosterStudio';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import { checkPageAccess } from '@/lib/auth/guards';
import { pieceAvailability, posterCandidateOptions } from '@/lib/posters/pieces';
import { posterSiteUrl } from '@/modules/projects/services/poster.service';
import { getPageantSitePreview } from '@/modules/projects/services/public-site.service';

export const metadata = { title: 'Afiches del certamen' };

export default async function ProjectPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkPageAccess('projects:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const site = await getPageantSitePreview(access.context.companyId, id);
  if (!site) notFound();

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/projects/${id}`} className={buttonVariants({ variant: 'outline' })}>
        ← Volver al centro de mando
      </Link>
      <PageHeader
        eyebrow={site.name}
        title="Afiches del certamen"
        description="Piezas listas para Instagram, pantallas e impresión, armadas con los datos reales del sitio público. Lo que el certamen no tiene configurado, no aparece."
      />
      <PosterStudio
        projectId={id}
        slug={site.slug === 'vista-previa' ? 'certamen' : site.slug}
        defaultAccent={site.accent}
        availability={pieceAvailability(site, new Date())}
        candidates={posterCandidateOptions(site)}
        hasPublicUrl={posterSiteUrl(site) !== null}
      />
    </div>
  );
}

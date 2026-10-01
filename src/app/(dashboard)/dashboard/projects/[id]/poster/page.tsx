import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { PosterStudio } from '@/components/projects/PosterStudio';
import { PageAccessNotice } from '@/components/shared/PageAccessNotice';
import { can, checkPageAccess } from '@/lib/auth/guards';
import { getAppUrl } from '@/lib/email/mailer';
import { listPosterDesigns } from '@/modules/projects/services/poster-designs.service';
import { posterSiteUrl } from '@/modules/projects/services/poster.service';
import { getPageantSitePreview } from '@/modules/projects/services/public-site.service';

export const metadata = { title: 'Afiches del certamen' };

export default async function ProjectPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkPageAccess('projects:read');
  if (access.denied) return <PageAccessNotice denied={access.denied} />;
  const { companyId } = access.context;
  const [site, designs] = await Promise.all([getPageantSitePreview(companyId, id), listPosterDesigns(companyId, id)]);
  if (!site) notFound();

  return (
    <div className="space-y-5">
      <Link href={`/dashboard/projects/${id}`} className={buttonVariants({ variant: 'outline' })}>
        ← Volver al centro de mando
      </Link>
      <PageHeader
        eyebrow={site.name}
        title="Afiches del certamen"
        description="Piezas listas para Instagram, pantallas e impresión, armadas con los datos reales del sitio público. Personaliza textos e imágenes y guarda tus diseños."
      />
      <PosterStudio
        projectId={id}
        slug={site.slug === 'vista-previa' ? 'certamen' : site.slug}
        site={site}
        origin={site.customDomain ? `https://${site.customDomain}` : getAppUrl()}
        siteUrl={posterSiteUrl(site)}
        canWrite={can(access.context, 'projects:write')}
        initialDesigns={designs}
      />
    </div>
  );
}

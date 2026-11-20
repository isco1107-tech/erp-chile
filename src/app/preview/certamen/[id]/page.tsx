import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageantSiteDocument } from '@/components/public/pageant/PageantSiteDocument';
import { checkPageAccess } from '@/lib/auth/guards';
import { PageantStudioPreview } from '@/components/projects/PageantStudioPreview';
import { getAppUrl } from '@/lib/email/mailer';
import { getPageantSiteEditorBase, getPageantSitePreview } from '@/modules/projects/services/public-site.service';

/**
 * Vista previa del micrositio de un certamen para el equipo, con o sin
 * publicar. Es la página que el visor "Vista previa por dispositivos" del panel
 * incrusta en un iframe (mismo origen). Exige sesión (el proxy manda a /login
 * a quien no la tiene), permiso de lectura de proyectos y filtra por la empresa
 * de la sesión: un certamen ajeno responde "no encontrado". Nunca se indexa.
 */
export const metadata: Metadata = { title: 'Vista previa del sitio', robots: { index: false, follow: false } };

export default async function PageantPreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ studio?: string }> }) {
  const { id } = await params;
  const access = await checkPageAccess('projects:read');
  if (access.denied) notFound();
  const studio = (await searchParams).studio === '1';
  const site = await (studio ? getPageantSiteEditorBase : getPageantSitePreview)(access.context.companyId, id);
  if (!site) notFound();
  if (studio) return <PageantStudioPreview saved={site} at={new Date().toISOString()} baseUrl={getAppUrl()} />;
  return <PageantSiteDocument site={site} />;
}

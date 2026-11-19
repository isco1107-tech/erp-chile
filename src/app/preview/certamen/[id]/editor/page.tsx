import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageantEditorCanvas } from '@/components/projects/site-editor/PageantEditorCanvas';
import { checkPageAccess } from '@/lib/auth/guards';
import { getAppUrl } from '@/lib/email/mailer';
import { getPageantSiteEditorBase } from '@/modules/projects/services/public-site.service';

/**
 * Lienzo del editor visual del micrositio (va dentro de un iframe del panel,
 * mismo origen). Exige sesión y permiso de lectura de proyectos y filtra por la
 * empresa de la sesión: un certamen ajeno responde «no encontrado». Trae los
 * datos de todas las secciones (`getPageantSiteEditorBase`) para que el editor
 * las prenda y apague en vivo; lo que se edita no se guarda desde aquí. Nunca
 * se indexa.
 */
export const metadata: Metadata = { title: 'Editor visual del sitio', robots: { index: false, follow: false } };

export default async function PageantEditorCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkPageAccess('projects:read');
  if (access.denied) notFound();
  const site = await getPageantSiteEditorBase(access.context.companyId, id);
  if (!site) notFound();
  return <PageantEditorCanvas base={site} now={new Date().toISOString()} baseUrl={getAppUrl()} />;
}

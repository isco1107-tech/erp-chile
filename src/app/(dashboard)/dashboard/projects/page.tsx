import { PageHeader } from '@/components/ui/PageHeader';
import ProjectListClient from '@/components/projects/ProjectListClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Eventos & Proyectos' };

export default async function ProjectsPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'projects:write');

  return (
    <div>
      <PageHeader className="mb-5" eyebrow="Producción de eventos" title="Certámenes y eventos" description="Cada certamen con su centro de mando: preparación, candidatas, auspicios, entradas, votación, escaleta y finanzas." />
      <ProjectListClient canWrite={canWrite} />
    </div>
  );
}

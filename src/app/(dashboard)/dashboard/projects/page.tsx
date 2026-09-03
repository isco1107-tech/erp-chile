import ProjectListClient from '@/components/projects/ProjectListClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Eventos & Proyectos' };

export default async function ProjectsPage() {
  const context = await getAuthContext();
  const canWrite = can(context, 'projects:write');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Eventos & Proyectos</h1>
      <ProjectListClient canWrite={canWrite} />
    </div>
  );
}

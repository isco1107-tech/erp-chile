import { notFound, redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import { getProjectAction } from '@/modules/projects/actions/projects.actions';
import ProjectForm from '@/components/projects/ProjectForm';

export const metadata = { title: 'Editar Proyecto/Evento' };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getAuthContext();
  if (!can(context, 'projects:write')) redirect(`/dashboard/projects/${id}`);

  const result = await getProjectAction(id);
  if (!result.success) notFound();

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Editar Proyecto/Evento</h1>
      <ProjectForm editingProject={result.data} />
    </div>
  );
}

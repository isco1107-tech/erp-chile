import { redirect } from 'next/navigation';
import { can, getAuthContext } from '@/lib/auth/guards';
import ProjectForm from '@/components/projects/ProjectForm';

export const metadata = { title: 'Nuevo Proyecto/Evento' };

export default async function NewProjectPage() {
  // El guard vive también aquí y no solo en la Server Action: sin esto un rol
  // sin `projects:write` llenaba el formulario completo para recibir un 403 al
  // guardar. Se usa `can` y no una lista de roles para que respete los roles
  // personalizados de la empresa. El layout del módulo ya cubrió el feature gate.
  const context = await getAuthContext();
  if (!can(context, 'projects:write')) redirect('/dashboard/projects');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Nuevo Proyecto/Evento</h1>
      <ProjectForm editingProject={null} />
    </div>
  );
}

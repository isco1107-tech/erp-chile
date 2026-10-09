import { PageHeader } from '@/components/ui/PageHeader';
import TasksClient from '@/components/tasks/TasksClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Tareas y delegación' };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ vista?: string | string[] }> }) {
  const [context, { vista }] = await Promise.all([getAuthContext(), searchParams]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Equipo"
        title="Tareas y delegación"
        description="Quién hace qué y para cuándo, con rutinas que se repiten solas, y las decisiones que cada persona puede tomar sin consultar al dueño."
      />
      {/* `?vista=equipo`: las tareas que crea un formulario de un sitio web llegan sin responsable. */}
      <TasksClient canManage={can(context, 'tasks:manage')} initialTab={vista === 'equipo' ? 'ALL' : 'MINE'} />
    </div>
  );
}

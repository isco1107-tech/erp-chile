import { PageHeader } from '@/components/ui/PageHeader';
import TasksClient from '@/components/tasks/TasksClient';
import { can, getAuthContext } from '@/lib/auth/guards';

export const metadata = { title: 'Tareas y delegación' };

export default async function TasksPage() {
  const context = await getAuthContext();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Equipo"
        title="Tareas y delegación"
        description="Quién hace qué y para cuándo, con rutinas que se repiten solas, y las decisiones que cada persona puede tomar sin consultar al dueño."
      />
      <TasksClient canManage={can(context, 'tasks:manage')} />
    </div>
  );
}

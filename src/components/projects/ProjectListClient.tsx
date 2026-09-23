'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Project, ProjectStatus } from '@prisma/client';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { listProjectsAction } from '@/modules/projects/actions/projects.actions';
import { PROJECT_STATUS_LABELS } from '@/modules/projects/schema';
import { formatCurrency } from '@/lib/chile/tax';
import type { Tone } from '@/components/ui/tone';
import DeleteProjectButton from './DeleteProjectButton';

const STATUS_TONE: Record<ProjectStatus, Tone> = {
  PLANNING: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

interface ProjectListClientProps {
  canWrite: boolean;
}

export default function ProjectListClient({ canWrite }: ProjectListClientProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const result = await listProjectsAction();
    if (result.success) setProjects(result.data);
    else toast.error(result.error);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canWrite && (
          <Link href="/dashboard/projects/new" className={buttonVariants({ variant: 'default' })} data-tutorial="module-primary-action">
            Nuevo Proyecto
          </Link>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando...</p>}

      {!loading && projects.length === 0 && (
        <EmptyState
          title="Todavía no hay proyectos"
          description="Crea tu primer centro de costo por evento o certamen para verlo aquí."
          action={
            canWrite && (
              <Link href="/dashboard/projects/new" className={buttonVariants({ size: 'sm' })}>
                Nuevo Proyecto
              </Link>
            )
          }
        />
      )}

      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const budgetUsage = project.budgetedIncome > 0
              ? Math.round((project.budgetedExpense / project.budgetedIncome) * 100)
              : 0;
            return (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`} className="group relative block">
                {canWrite && (
                  <DeleteProjectButton projectId={project.id} projectName={project.name} variant="icon" onDeleted={load} />
                )}
                <Card className="h-full transition-shadow duration-150 hover:shadow-hover">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{project.code}</p>
                        <CardTitle>{project.name}</CardTitle>
                      </div>
                      <StatusBadge tone={STATUS_TONE[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</StatusBadge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Presupuesto ingresos</span>
                      <span className="font-medium">{formatCurrency(project.budgetedIncome)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Presupuesto gastos</span>
                      <span className="font-medium">{formatCurrency(project.budgetedExpense)}</span>
                    </div>
                    <ProgressRow
                      label="Gasto/Ingreso"
                      value={budgetUsage}
                      color={budgetUsage > 100 ? 'var(--danger)' : 'var(--chart-1)'}
                    />
                    <p className="text-xs text-muted-foreground">
                      {new Date(project.startDate).toLocaleDateString('es-CL')}
                      {project.endDate ? ` — ${new Date(project.endDate).toLocaleDateString('es-CL')}` : ''}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

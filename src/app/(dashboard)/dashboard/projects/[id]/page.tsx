import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CircleDollarSign, TrendingDown, TrendingUp, Gift } from 'lucide-react';
import { getProjectAction } from '@/modules/projects/actions/projects.actions';
import { PROJECT_STATUS_LABELS } from '@/modules/projects/schema';
import { formatCurrency } from '@/lib/chile/tax';
import { buttonVariants } from '@/components/ui/button';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { can, getAuthContext } from '@/lib/auth/guards';
import type { Tone } from '@/components/ui/tone';
import type { ProjectStatus } from '@prisma/client';
import DeleteProjectButton from '@/components/projects/DeleteProjectButton';
import { ProjectFinanceCharts } from '@/components/projects/ProjectFinanceCharts';

export const metadata = { title: 'Detalle de Proyecto/Evento' };

const STATUS_TONE: Record<ProjectStatus, Tone> = {
  PLANNING: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result, context] = await Promise.all([getProjectAction(id), getAuthContext()]);
  if (!result.success) notFound();

  const project = result.data;
  const summary = project.financialSummary;
  const canWrite = can(context, 'projects:write');
  const marginTone: Tone = summary.marginAmount >= 0 ? 'success' : 'danger';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/dashboard/projects" className={buttonVariants({ variant: 'outline' })}>← Volver a Proyectos</Link>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/projects/${project.id}/edit`} className={buttonVariants({ variant: 'default' })}>
              Editar Proyecto
            </Link>
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-card">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{project.code}</p>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(project.startDate).toLocaleDateString('es-CL')}
            {project.endDate ? ` — ${new Date(project.endDate).toLocaleDateString('es-CL')}` : ''}
          </p>
        </div>
        <StatusBadge tone={STATUS_TONE[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</StatusBadge>
      </div>

      <p className="text-xs text-muted-foreground">
        Incluye auspicios cobrados y boletas de honorarios pagadas vinculadas a este proyecto. Las ventas y compras
        vinculadas también se suman aquí una vez que sus módulos permitan asignarles un proyecto.
      </p>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Ingresos reales (efectivo)"
          value={formatCurrency(summary.actualIncomeCash)}
          icon={CircleDollarSign}
          tone="accent"
        />
        <KpiCard
          label="Gastos reales"
          value={formatCurrency(summary.actualExpense)}
          icon={TrendingDown}
          tone="warning"
        />
        <KpiCard
          label="Margen"
          value={`${formatCurrency(summary.marginAmount)} (${summary.marginPercent}%)`}
          icon={TrendingUp}
          tone={marginTone}
        />
        <KpiCard
          label="Ingresos por canje (barter)"
          value={formatCurrency(summary.actualIncomeBarter)}
          icon={Gift}
          tone="info"
        />
      </section>

      <ProjectFinanceCharts summary={summary} />

      {project.notes && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-card text-sm">
          <h2 className="mb-2 text-base font-semibold text-foreground">Notas</h2>
          <p className="text-muted-foreground">{project.notes}</p>
        </section>
      )}
    </div>
  );
}

import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FilePen, FileQuestion } from 'lucide-react';
import { getAuthContext, can } from '@/lib/auth/guards';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { EmptyState } from '@/components/ui/EmptyState';
import ContractsChecklist from '@/components/contracts/ContractsChecklist';
import { getContractsOverview } from '@/modules/projects/services/contracts-overview.service';
import { STALE_SIGNATURE_DAYS } from '@/lib/events/contracts-checklist';

export const metadata = { title: 'Contratos firmados' };

function progressColor(percent: number): string {
  if (percent >= 80) return 'var(--success)';
  if (percent >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

/**
 * Checklist de contratos firmados de la productora: contratos de imagen de
 * candidatas y cartas de compromiso de auspiciadores, de todos los
 * certámenes, en una sola pantalla. Cada parte se muestra solo si la empresa
 * tiene el módulo y el usuario su permiso de lectura.
 */
export default async function ContractsPage() {
  const context = await getAuthContext();
  const scope = {
    candidates: context.features.hasCandidates && can(context, 'candidates:read'),
    sponsors: context.features.hasSponsorships && can(context, 'sponsorships:read'),
  };
  if (!scope.candidates && !scope.sponsors) redirect('/dashboard');

  const overview = await getContractsOverview(context.companyId, scope);
  const { summary } = overview;
  const kinds = [scope.candidates && 'contratos de imagen de candidatas', scope.sponsors && 'cartas de compromiso de auspiciadores']
    .filter(Boolean)
    .join(' y ');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Producción de eventos"
        title="Contratos firmados"
        description={`Checklist de ${kinds}, de todos tus certámenes. Primero lo que requiere acción.`}
      />

      {summary.total === 0 ? (
        <div className="rounded-lg border border-border bg-card shadow-card">
          <EmptyState
            title="Aún no hay contratos que firmar"
            description="Aparecen aquí cuando una candidata pasa a oficial o un auspicio se confirma, o cuando se genera su contrato."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Firmados"
              value={`${summary.signedPercent ?? 0}%`}
              icon={CheckCircle2}
              tone="success"
              hint={`${summary.signed} de ${summary.total} contratos`}
              trend={summary.signed === summary.total ? 'Completo' : undefined}
              trendDirection="up"
            />
            <KpiCard
              label="Pendientes de firma"
              value={String(summary.pending)}
              icon={FilePen}
              tone={summary.stale > 0 ? 'warning' : 'info'}
              hint={summary.stale > 0 ? `${summary.stale} llevan más de ${STALE_SIGNATURE_DAYS} días` : 'Generados y enviados'}
              trend={summary.stale > 0 ? `${summary.stale} atrasados` : undefined}
              trendDirection="down"
            />
            <KpiCard label="Sin generar" value={String(summary.notGenerated)} icon={FileQuestion} tone="neutral" hint="Exigibles, aún sin contrato" />
            <KpiCard label="Vencidos" value={String(summary.expired)} icon={AlertTriangle} tone={summary.expired > 0 ? 'danger' : 'neutral'} hint="Hay que renovarlos" />
          </div>

          {overview.byProject.length > 1 && (
            <section className="rounded-lg border border-border bg-card p-5 shadow-card">
              <h2 className="mb-4 text-sm font-semibold text-foreground">Avance por certamen</h2>
              <div className="space-y-3">
                {overview.byProject.map((project) => (
                  <div key={project.projectId} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <ProgressRow label={project.projectName} value={project.signedPercent ?? 0} color={progressColor(project.signedPercent ?? 0)} className="flex-1 [&>span:first-child]:w-44" />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums sm:w-40 sm:text-right">
                      {project.signed}/{project.total} firmados{project.stale > 0 ? ` · ${project.stale} atrasados` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <ContractsChecklist items={overview.items} projects={overview.byProject.map((p) => ({ id: p.projectId, name: p.projectName }))} showKind={scope.candidates && scope.sponsors} />
        </>
      )}
    </div>
  );
}

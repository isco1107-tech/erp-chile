import Link from 'next/link';
import { getCandidateComplianceBoardAction } from '@/modules/candidates/actions/candidates.actions';
import type { CandidateContractStatus } from '@/modules/candidates/services/candidates.service';
import { KpiCard } from '@/components/ui/KpiCard';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import { AlertTriangle, FileWarning, TrendingUp } from 'lucide-react';

export const metadata = { title: 'Cumplimiento de Candidatas' };

const CONTRACT_STATUS_LABEL: Record<CandidateContractStatus, string> = {
  NOT_GENERATED: 'Contrato no generado',
  PENDING_SIGNATURE: 'Contrato pendiente de firma',
  SIGNED: 'Contrato firmado',
};

const CONTRACT_STATUS_TONE: Record<CandidateContractStatus, 'neutral' | 'warning' | 'success'> = {
  NOT_GENERATED: 'neutral',
  PENDING_SIGNATURE: 'warning',
  SIGNED: 'success',
};

function progressColor(percent: number): string {
  if (percent >= 80) return 'var(--success)';
  if (percent >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

export default async function CandidateComplianceBoardPage() {
  const result = await getCandidateComplianceBoardAction();
  const rows = result.success ? result.data : [];

  const signedCount = rows.filter((r) => r.contractStatus === 'SIGNED').length;
  const contractRate = rows.length === 0 ? 0 : Math.round((signedCount / rows.length) * 100);
  const expiredTotal = rows.reduce((sum, r) => sum + r.expiredDocuments, 0);
  const pendingTotal = rows.reduce((sum, r) => sum + r.pendingDocuments, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tablero de Cumplimiento</h1>
        <Link href="/dashboard/candidates" className={buttonVariants({ variant: 'outline' })}>← Volver a Candidatas</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Contratos firmados" value={`${contractRate}%`} icon={TrendingUp} hint={`${signedCount}/${rows.length} candidatas`} />
        <KpiCard label="Documentos pendientes" value={String(pendingTotal)} icon={FileWarning} />
        <KpiCard label="Documentos vencidos" value={String(expiredTotal)} icon={AlertTriangle} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Estado por candidata</h2>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin candidatas todavía.</p>}
        <div className="space-y-3">
          {rows.map((row) => (
            <Link key={row.candidateId} href={`/dashboard/candidates/${row.candidateId}`} className="block rounded-lg p-2 hover:bg-muted">
              <ProgressRow label={row.stageName || row.fullName} value={row.attendanceRate ?? 0} color={progressColor(row.attendanceRate ?? 0)} />
              <div className="ml-28 mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {row.attendanceRate === null ? 'Sin asistencia registrada' : `${row.attendanceRate}% de asistencia`}
                  {row.pendingDocuments > 0 && ` · ${row.pendingDocuments} doc. pendiente(s)`}
                  {row.expiredDocuments > 0 && ` · ${row.expiredDocuments} doc. vencido(s)`}
                </p>
                <StatusBadge tone={CONTRACT_STATUS_TONE[row.contractStatus]}>{CONTRACT_STATUS_LABEL[row.contractStatus]}</StatusBadge>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

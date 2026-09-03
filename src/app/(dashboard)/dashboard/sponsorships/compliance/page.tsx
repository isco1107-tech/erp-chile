import Link from 'next/link';
import { getSponsorshipComplianceBoardAction } from '@/modules/sponsorships/actions/sponsorships.actions';
import type { AgreementStatus } from '@/modules/sponsorships/services/sponsorships.service';
import { formatCurrency } from '@/lib/chile/tax';
import { KpiCard } from '@/components/ui/KpiCard';
import { ProgressRow } from '@/components/ui/ProgressRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { buttonVariants } from '@/components/ui/button';
import { Handshake, TrendingUp, Wallet } from 'lucide-react';

const AGREEMENT_STATUS_LABEL: Record<AgreementStatus, string> = {
  NOT_GENERATED: 'Carta no generada',
  PENDING_SIGNATURE: 'Carta pendiente de firma',
  SIGNED: 'Carta firmada',
};

const AGREEMENT_STATUS_TONE: Record<AgreementStatus, 'neutral' | 'warning' | 'success'> = {
  NOT_GENERATED: 'neutral',
  PENDING_SIGNATURE: 'warning',
  SIGNED: 'success',
};

export const metadata = { title: 'Cumplimiento de Auspicios' };

/** Verde a partir de 80% cumplido, ámbar entre 40-79%, rojo bajo 40 — mismo criterio visual que el resto del ERP para semáforos de avance. */
function progressColor(percent: number): string {
  if (percent >= 80) return 'var(--success)';
  if (percent >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

export default async function SponsorshipComplianceBoardPage() {
  const result = await getSponsorshipComplianceBoardAction();
  const rows = result.success ? result.data : [];

  const totalCash = rows.reduce((sum, r) => sum + r.cashAmount, 0);
  const totalBarter = rows.reduce((sum, r) => sum + r.barterValuation, 0);
  const avgCompliance = rows.length === 0 ? 0 : Math.round(rows.reduce((sum, r) => sum + r.compliancePercent, 0) / rows.length);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tablero de Cumplimiento</h1>
        <Link href="/dashboard/sponsorships" className={buttonVariants({ variant: 'outline' })}>← Volver a Auspicios</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Cumplimiento promedio" value={`${avgCompliance}%`} icon={TrendingUp} />
        <KpiCard label="Total valorizado en efectivo" value={formatCurrency(totalCash)} icon={Wallet} />
        <KpiCard label="Total valorizado en canje" value={formatCurrency(totalBarter)} icon={Handshake} />
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Cumplimiento por marca</h2>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin contratos de auspicio todavía.</p>}
        <div className="space-y-3">
          {rows.map((row) => (
            <Link key={row.contractId} href={`/dashboard/sponsorships/${row.contractId}`} className="block rounded-lg p-2 hover:bg-muted">
              <ProgressRow
                label={row.razonSocial}
                value={row.compliancePercent}
                color={progressColor(row.compliancePercent)}
              />
              <div className="ml-28 mt-0.5 flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {row.completedDeliverables}/{row.totalDeliverables} entregables completados
                </p>
                <StatusBadge tone={AGREEMENT_STATUS_TONE[row.agreementStatus]}>{AGREEMENT_STATUS_LABEL[row.agreementStatus]}</StatusBadge>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

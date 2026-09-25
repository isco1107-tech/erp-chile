import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BadgePercent, ChevronLeft, ChevronRight, CircleDollarSign, UserX } from 'lucide-react';
import { can, getAuthContext } from '@/lib/auth/guards';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { formatCurrency } from '@/lib/chile/tax';
import { PageHeader } from '@/components/ui/PageHeader';
import { KpiCard } from '@/components/ui/KpiCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonVariants } from '@/components/ui/button';
import CommissionRatesClient from '@/components/sales/CommissionRatesClient';
import { getCommissionReport, listSellers } from '@/modules/sales/services/commissions.service';
import { formatRate } from '@/modules/sales/commissions';

export const metadata = { title: 'Comisiones de vendedores' };

function parseMonth(value: string | undefined): { year: number; month: number } {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  const today = santiagoDateParts(new Date());
  return { year: today.year, month: today.month };
}

function shift(year: number, month: number, offset: number): string {
  const total = year * 12 + (month - 1) + offset;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const context = await getAuthContext();
  // Las comisiones son remuneración variable: las ve quien ve reportes.
  if (!can(context, 'reports:read')) redirect('/dashboard/sales');
  const { year, month } = parseMonth((await searchParams).month);
  const canEditRates = can(context, 'settings:users');
  const [report, sellers] = await Promise.all([getCommissionReport(context.companyId, year, month), canEditRates ? listSellers(context.companyId) : Promise.resolve([])]);
  const monthLabel = new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ventas"
        title="Comisiones de vendedores"
        description="Venta neta (sin IVA) por vendedor en el mes y la comisión que corresponde según su tasa. Las notas de crédito restan."
        actions={
          <div className="flex items-center gap-1">
            <Link href={`?month=${shift(year, month, -1)}`} className={buttonVariants({ variant: 'outline', size: 'icon' })} aria-label="Mes anterior">
              <ChevronLeft aria-hidden="true" />
            </Link>
            <span className="min-w-36 text-center text-sm font-medium capitalize">{monthLabel}</span>
            <Link href={`?month=${shift(year, month, 1)}`} className={buttonVariants({ variant: 'outline', size: 'icon' })} aria-label="Mes siguiente">
              <ChevronRight aria-hidden="true" />
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Venta neta con vendedor" value={formatCurrency(report.totalBase)} icon={CircleDollarSign} tone="accent" hint="Base de cálculo del mes" />
        <KpiCard label="Comisiones del mes" value={formatCurrency(report.totalCommission)} icon={BadgePercent} tone="success" hint={`${report.rows.filter((r) => r.commission > 0).length} vendedor(es) con comisión`} />
        <KpiCard label="Venta sin vendedor" value={formatCurrency(report.unassignedBase)} icon={UserX} tone={report.unassignedBase > 0 ? 'warning' : 'neutral'} hint="Emitida antes de registrar vendedor" />
      </div>

      <section className="rounded-lg border border-border bg-card shadow-card" aria-labelledby="commissions-table">
        <h2 id="commissions-table" className="border-b border-border px-5 py-3 text-sm font-semibold">Detalle por vendedor</h2>
        {report.rows.length === 0 ? (
          <EmptyState title="Sin ventas en el mes" description="Cuando se emitan ventas con vendedor asignado aparecerán acá." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-5 py-2.5 font-medium">Vendedor</th>
                  <th className="px-3 py-2.5 font-medium">Base</th>
                  <th className="px-3 py-2.5 text-right font-medium">Documentos</th>
                  <th className="px-3 py-2.5 text-right font-medium">Venta neta</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tasa</th>
                  <th className="px-5 py-2.5 text-right font-medium">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.rows.map((row) => (
                  <tr key={row.sellerId}>
                    <td className="px-5 py-2.5 font-medium">{row.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.basis === 'ISSUED' ? 'Facturado' : 'Cobrado'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.documents}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(row.base)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.rateBps > 0 ? formatRate(row.rateBps) : '—'}</td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{formatCurrency(row.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEditRates && (
        <section className="rounded-lg border border-border bg-card shadow-card" aria-labelledby="commission-rates">
          <div className="border-b border-border px-5 py-3">
            <h2 id="commission-rates" className="text-sm font-semibold">Tasas de comisión</h2>
            <p className="text-xs text-muted-foreground">Porcentaje sobre la venta neta. &quot;Sobre lo cobrado&quot; comisiona recién cuando el cliente paga.</p>
          </div>
          <CommissionRatesClient sellers={sellers} />
        </section>
      )}
    </div>
  );
}

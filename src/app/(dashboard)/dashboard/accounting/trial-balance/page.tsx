import { Sheet } from 'lucide-react';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { getEightColumnBalance } from '@/modules/accounting/services/books.service';
import { parseAccountingPeriod } from '@/components/accounting/period';
import { PeriodFilter } from '@/components/accounting/PeriodFilter';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import PrintButton from '@/components/PrintButton';

export const metadata = { title: 'Balance de Comprobación' };

function amount(value: number): string {
  return value ? formatCurrency(value) : '';
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await requireAuthWithPermission('accounting:view').catch(() => null);
  if (!session) return null;
  const period = parseAccountingPeriod(await searchParams);
  const balance = await getEightColumnBalance(session.companyId, period.to);
  const { totals, result } = balance;

  // Línea de cuadre: la utilidad va al Pasivo y a Pérdidas; la pérdida, al
  // Activo y a Ganancias. Así las cuatro parejas de columnas suman igual.
  const isProfit = result >= 0;
  const final = {
    assets: totals.assets + (isProfit ? 0 : -result),
    liabilities: totals.liabilities + (isProfit ? result : 0),
    losses: totals.losses + (isProfit ? result : 0),
    gains: totals.gains + (isProfit ? 0 : -result),
  };
  const squared =
    totals.sumDebit === totals.sumCredit &&
    totals.balanceDebit === totals.balanceCredit &&
    final.assets === final.liabilities &&
    final.losses === final.gains;

  const head = 'px-3 py-2 text-right font-medium';
  const cell = 'px-3 py-1.5 text-right';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Contabilidad"
        title="Balance de Comprobación"
        description={`Balance de 8 columnas acumulado al cierre de ${period.label}: sumas, saldos, inventario y resultados.`}
        actions={<PrintButton />}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodFilter period={period} />
        {balance.rows.length > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <StatusBadge tone={squared ? 'success' : 'danger'}>{squared ? 'Columnas cuadradas' : 'Hay un descuadre'}</StatusBadge>
            <span className="text-muted-foreground">
              {isProfit ? 'Utilidad' : 'Pérdida'} del ejercicio:{' '}
              <strong className={isProfit ? 'text-success' : 'text-danger'}>{formatCurrency(Math.abs(result))}</strong>
            </span>
          </div>
        )}
      </div>

      {balance.rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <EmptyState
            icon={<Sheet className="size-10 text-muted-foreground/50" aria-hidden="true" />}
            title="Todavía no hay movimientos contables"
            description="El balance se arma solo a partir de los asientos que generan ventas, compras, pagos y cierres de caja."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card print:border-0 print:shadow-none">
          <table className="w-full min-w-[1100px] text-[13px]">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border bg-muted/50">
                <th rowSpan={2} className="px-3 py-2 text-left font-medium">Cuenta</th>
                <th colSpan={2} className="border-l border-border px-3 py-2 text-center font-semibold text-foreground">Sumas</th>
                <th colSpan={2} className="border-l border-border px-3 py-2 text-center font-semibold text-foreground">Saldos</th>
                <th colSpan={2} className="border-l border-border px-3 py-2 text-center font-semibold text-foreground">Inventario</th>
                <th colSpan={2} className="border-l border-border px-3 py-2 text-center font-semibold text-foreground">Resultados</th>
              </tr>
              <tr className="border-b border-border bg-muted/30">
                <th className={`${head} border-l border-border`}>Debe</th>
                <th className={head}>Haber</th>
                <th className={`${head} border-l border-border`}>Deudor</th>
                <th className={head}>Acreedor</th>
                <th className={`${head} border-l border-border`}>Activo</th>
                <th className={head}>Pasivo</th>
                <th className={`${head} border-l border-border`}>Pérdidas</th>
                <th className={head}>Ganancias</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {balance.rows.map((row) => (
                <tr key={row.accountId} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5">
                    <span className="text-muted-foreground">{row.code}</span> {row.name}
                  </td>
                  <td className={`${cell} border-l border-border/60`}>{amount(row.sumDebit)}</td>
                  <td className={cell}>{amount(row.sumCredit)}</td>
                  <td className={`${cell} border-l border-border/60`}>{amount(row.balanceDebit)}</td>
                  <td className={cell}>{amount(row.balanceCredit)}</td>
                  <td className={`${cell} border-l border-border/60`}>{amount(row.assets)}</td>
                  <td className={cell}>{amount(row.liabilities)}</td>
                  <td className={`${cell} border-l border-border/60`}>{amount(row.losses)}</td>
                  <td className={cell}>{amount(row.gains)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-3 py-2">Subtotales</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(totals.sumDebit)}</td>
                <td className={cell}>{formatCurrency(totals.sumCredit)}</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(totals.balanceDebit)}</td>
                <td className={cell}>{formatCurrency(totals.balanceCredit)}</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(totals.assets)}</td>
                <td className={cell}>{formatCurrency(totals.liabilities)}</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(totals.losses)}</td>
                <td className={cell}>{formatCurrency(totals.gains)}</td>
              </tr>
              <tr className="text-muted-foreground">
                <td className="px-3 py-2">{isProfit ? 'Utilidad del ejercicio' : 'Pérdida del ejercicio'}</td>
                <td colSpan={4} className="border-l border-border" />
                <td className={`${cell} border-l border-border`}>{isProfit ? '' : formatCurrency(-result)}</td>
                <td className={cell}>{isProfit ? formatCurrency(result) : ''}</td>
                <td className={`${cell} border-l border-border`}>{isProfit ? formatCurrency(result) : ''}</td>
                <td className={cell}>{isProfit ? '' : formatCurrency(-result)}</td>
              </tr>
              <tr className="border-t border-border bg-muted/60 font-bold">
                <td className="px-3 py-2">Totales</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(totals.sumDebit)}</td>
                <td className={cell}>{formatCurrency(totals.sumCredit)}</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(totals.balanceDebit)}</td>
                <td className={cell}>{formatCurrency(totals.balanceCredit)}</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(final.assets)}</td>
                <td className={cell}>{formatCurrency(final.liabilities)}</td>
                <td className={`${cell} border-l border-border`}>{formatCurrency(final.losses)}</td>
                <td className={cell}>{formatCurrency(final.gains)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

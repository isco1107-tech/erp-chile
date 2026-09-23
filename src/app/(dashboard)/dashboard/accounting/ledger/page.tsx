import Link from 'next/link';
import { BookMarked } from 'lucide-react';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { listPostableAccounts } from '@/modules/accounting/services/books.service';
import { getLedger } from '@/modules/accounting/services/ledger.service';
import { parseAccountingPeriod } from '@/components/accounting/period';
import { PeriodFilter } from '@/components/accounting/PeriodFilter';
import { SOURCE_LABELS, sourceHref } from '@/components/accounting/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import PrintButton from '@/components/PrintButton';

export const metadata = { title: 'Libro Mayor' };

/** Saldo con su naturaleza: "$1.250.000 D" (deudor) o "$80.000 A" (acreedor). */
function balanceLabel(net: number): string {
  if (net === 0) return formatCurrency(0);
  return `${formatCurrency(Math.abs(net))} ${net > 0 ? 'D' : 'A'}`;
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; account?: string }>;
}) {
  const session = await requireAuthWithPermission('accounting:view').catch(() => null);
  if (!session) return null;
  const params = await searchParams;
  const period = parseAccountingPeriod(params);
  const accounts = await listPostableAccounts(session.companyId);
  const selected = accounts.find((account) => account.id === params.account) ?? null;

  // `getLedger` incluye `dateTo`; el período termina 1 ms antes del mes siguiente.
  const ledger = selected
    ? await getLedger(session.companyId, selected.id, period.from, new Date(period.to.getTime() - 1))
    : null;
  const periodDebit = ledger?.lines.reduce((sum, line) => sum + line.debit, 0) ?? 0;
  const periodCredit = ledger?.lines.reduce((sum, line) => sum + line.credit, 0) ?? 0;
  const dateFormat = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Contabilidad"
        title="Libro Mayor"
        description="Movimientos de una cuenta con su saldo acumulado, partiendo del saldo al inicio del período."
        actions={selected ? <PrintButton /> : undefined}
      />

      <PeriodFilter period={period}>
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
          Cuenta
          <select
            name="account"
            defaultValue={selected?.id ?? ''}
            required
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground"
          >
            <option value="" disabled>
              Elige una cuenta…
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
        </label>
      </PeriodFilter>

      {!selected || !ledger ? (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <EmptyState
            icon={<BookMarked className="size-10 text-muted-foreground/50" aria-hidden="true" />}
            title={accounts.length === 0 ? 'El plan de cuentas está vacío' : 'Elige una cuenta para ver su mayor'}
            description={
              accounts.length === 0
                ? 'Configura el plan de cuentas de la empresa para empezar a contabilizar.'
                : 'Selecciona la cuenta y el período, y presiona "Ver período".'
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold">
              <span className="text-muted-foreground">{selected.code}</span> {selected.name}
            </h2>
            <p className="text-sm text-muted-foreground">{period.label}</p>
          </div>
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="w-28 px-4 py-2.5 font-medium">Fecha</th>
                <th className="w-24 px-4 py-2.5 font-medium">Asiento</th>
                <th className="px-4 py-2.5 font-medium">Glosa</th>
                <th className="w-32 px-4 py-2.5 text-right font-medium">Debe</th>
                <th className="w-32 px-4 py-2.5 text-right font-medium">Haber</th>
                <th className="w-40 px-4 py-2.5 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                <td colSpan={5} className="px-4 py-2">Saldo inicial</td>
                <td className="px-4 py-2 text-right font-medium text-foreground">{balanceLabel(ledger.openingBalance)}</td>
              </tr>
              {ledger.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Sin movimientos en {period.label}.
                  </td>
                </tr>
              )}
              {ledger.lines.map((line) => {
                const href = sourceHref(line.entry.sourceType as keyof typeof SOURCE_LABELS, line.entry.sourceId);
                return (
                  <tr key={line.id} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{dateFormat.format(line.entry.date)}</td>
                    <td className="px-4 py-2">
                      {line.entry.entryNumber}
                      <span className="text-muted-foreground">/{line.entry.year}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-foreground">{line.description ?? line.entry.description}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {SOURCE_LABELS[line.entry.sourceType as keyof typeof SOURCE_LABELS] ?? line.entry.sourceType}
                      </span>
                      {href && (
                        <Link href={href} className="ml-2 text-xs font-medium underline-offset-4 hover:underline print:hidden">
                          Ver
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{line.debit ? formatCurrency(line.debit) : ''}</td>
                    <td className="px-4 py-2 text-right">{line.credit ? formatCurrency(line.credit) : ''}</td>
                    <td className="px-4 py-2 text-right font-medium">{balanceLabel(line.runningBalance)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td colSpan={3} className="px-4 py-2.5">Totales del período y saldo final</td>
                <td className="px-4 py-2.5 text-right">{formatCurrency(periodDebit)}</td>
                <td className="px-4 py-2.5 text-right">{formatCurrency(periodCredit)}</td>
                <td className="px-4 py-2.5 text-right">{balanceLabel(ledger.closingBalance)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="px-4 py-2 text-xs text-muted-foreground">D = saldo deudor · A = saldo acreedor</p>
        </div>
      )}
    </div>
  );
}

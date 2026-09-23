import Link from 'next/link';
import { BookOpenText, ChevronLeft, ChevronRight } from 'lucide-react';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { listJournalEntries } from '@/modules/accounting/services/books.service';
import { parseAccountingPeriod } from '@/components/accounting/period';
import { PeriodFilter } from '@/components/accounting/PeriodFilter';
import { SOURCE_LABELS, sourceHref } from '@/components/accounting/labels';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import PrintButton from '@/components/PrintButton';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Libro Diario' };

const PAGE_SIZE = 25;

export default async function JournalBookPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; page?: string }>;
}) {
  // Sin permiso, ModuleGate (layout) ya muestra el aviso: la página no carga nada.
  const session = await requireAuthWithPermission('accounting:view').catch(() => null);
  if (!session) return null;
  const params = await searchParams;
  const period = parseAccountingPeriod(params);
  const requestedPage = Math.max(1, Math.floor(Number(params.page)) || 1);

  const book = await listJournalEntries(session.companyId, period.from, period.to, { page: requestedPage, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(book.total / PAGE_SIZE));
  const balanced = book.periodDebit === book.periodCredit;

  const pageHref = (page: number) => `?year=${period.year}&month=${period.month}&page=${page}`;
  const dateFormat = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Santiago' });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Contabilidad"
        title="Libro Diario"
        description={`Asientos contabilizados de ${period.label}, en orden cronológico.`}
        actions={<PrintButton />}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <PeriodFilter period={period} />
        <dl className="flex gap-6 text-sm tabular-nums">
          <div>
            <dt className="text-xs text-muted-foreground">Asientos</dt>
            <dd className="font-semibold">{book.total.toLocaleString('es-CL')}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total Debe</dt>
            <dd className="font-semibold">{formatCurrency(book.periodDebit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total Haber</dt>
            <dd className="font-semibold">{formatCurrency(book.periodCredit)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cuadratura</dt>
            <dd>
              <StatusBadge tone={balanced ? 'success' : 'danger'}>{balanced ? 'Cuadrado' : 'Descuadre'}</StatusBadge>
            </dd>
          </div>
        </dl>
      </div>

      {book.entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <EmptyState
            icon={<BookOpenText className="size-10 text-muted-foreground/50" aria-hidden="true" />}
            title={`Sin asientos en ${period.label}`}
            description="Los asientos se generan solos al emitir ventas y compras, registrar pagos y cerrar turnos de caja."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card print:border-0 print:shadow-none">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Cuenta</th>
                <th className="px-4 py-2.5 font-medium">Glosa</th>
                <th className="w-36 px-4 py-2.5 text-right font-medium">Debe</th>
                <th className="w-36 px-4 py-2.5 text-right font-medium">Haber</th>
              </tr>
            </thead>
            {book.entries.map((entry) => {
              const href = sourceHref(entry.sourceType, entry.sourceId);
              return (
                <tbody key={entry.id} className="border-b border-border last:border-0 break-inside-avoid">
                  <tr className="bg-muted/25">
                    <th colSpan={4} scope="rowgroup" className="px-4 py-2 text-left font-normal">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-foreground">
                          N° {entry.entryNumber}
                          <span className="font-normal text-muted-foreground">/{entry.year}</span>
                        </span>
                        <span className="text-muted-foreground">{dateFormat.format(entry.date)}</span>
                        <span className="min-w-0 flex-1 truncate text-foreground">{entry.description}</span>
                        <StatusBadge tone="neutral">{SOURCE_LABELS[entry.sourceType]}</StatusBadge>
                        {entry.status === 'REVERSED' && <StatusBadge tone="warning">Reversado</StatusBadge>}
                        {href && (
                          <Link href={href} className="text-xs font-medium text-foreground underline-offset-4 hover:underline print:hidden">
                            Ver documento
                          </Link>
                        )}
                      </div>
                    </th>
                  </tr>
                  {entry.lines.map((line) => (
                    <tr key={line.id}>
                      <td className={cn('px-4 py-1.5', line.credit > 0 && line.debit === 0 && 'pl-10')}>
                        <span className="text-muted-foreground">{line.accountCode}</span> {line.accountName}
                      </td>
                      <td className="px-4 py-1.5 text-muted-foreground">{line.description ?? ''}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{line.debit ? formatCurrency(line.debit) : ''}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{line.credit ? formatCurrency(line.credit) : ''}</td>
                    </tr>
                  ))}
                  <tr className="text-xs text-muted-foreground">
                    <td colSpan={2} className="px-4 pt-1 pb-2.5 text-right">Totales del asiento</td>
                    <td className="border-t border-border px-4 pt-1 pb-2.5 text-right font-medium tabular-nums text-foreground">{formatCurrency(entry.totalDebit)}</td>
                    <td className="border-t border-border px-4 pt-1 pb-2.5 text-right font-medium tabular-nums text-foreground">{formatCurrency(entry.totalCredit)}</td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginación del libro" className="flex items-center justify-between gap-3 text-sm print:hidden">
          <p className="text-muted-foreground">
            Página {book.page} de {totalPages}
          </p>
          <div className="flex gap-2">
            {book.page > 1 ? (
              <Link href={pageHref(book.page - 1)} className={buttonVariants({ variant: 'outline' })}>
                <ChevronLeft aria-hidden="true" /> Anterior
              </Link>
            ) : null}
            {book.page < totalPages ? (
              <Link href={pageHref(book.page + 1)} className={buttonVariants({ variant: 'outline' })}>
                Siguiente <ChevronRight aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </nav>
      )}
    </div>
  );
}

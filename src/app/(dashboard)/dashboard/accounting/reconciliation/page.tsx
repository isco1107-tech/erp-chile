import Link from 'next/link';
import { CheckCircle2, ListChecks, TriangleAlert } from 'lucide-react';
import { requireAuthWithPermission } from '@/lib/auth/guards';
import { formatCurrency } from '@/lib/chile/tax';
import { runReconciliationWithF29, type ReconciliationCheck } from '@/modules/accounting/services/reconciliation.service';
import { parseAccountingPeriod } from '@/components/accounting/period';
import { PeriodFilter } from '@/components/accounting/PeriodFilter';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Cuadraturas' };

/** De dónde sale el "esperado" de cada cuadratura: la fuente operativa independiente del mayor. */
const SOURCE_DESCRIPTION: Record<ReconciliationCheck['key'], string> = {
  EXISTENCIAS: 'Stock actual × costo PMP de cada producto (kardex).',
  CLIENTES: 'Saldo pendiente de ventas emitidas (Cuentas por Cobrar).',
  PROVEEDORES: 'Saldo pendiente de compras emitidas (Cuentas por Pagar).',
  IVA_DEBITO: 'Débito fiscal del período según el F29.',
  IVA_CREDITO: 'Crédito fiscal del período según el F29.',
  CAJA: 'Efectivo contado al cerrar los turnos de caja.',
};

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await requireAuthWithPermission('accounting:view').catch(() => null);
  if (!session) return null;
  const period = parseAccountingPeriod(await searchParams);
  const { checks, f29 } = await runReconciliationWithF29(session.companyId, { year: period.year, month: period.month });
  const failing = checks.filter((check) => !check.inBalance);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Contabilidad"
        title="Cuadraturas"
        description="Cada saldo del libro mayor comparado con su fuente operativa. Si alguna no cuadra, hay un error real en uno de los dos lados."
      />

      <PeriodFilter period={period} />

      {checks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <EmptyState
            icon={<ListChecks className="size-10 text-muted-foreground/50" aria-hidden="true" />}
            title="Sin cuentas mapeadas"
            description="Las cuadraturas necesitan que el plan de cuentas tenga asignadas las cuentas de Existencias, Clientes, Proveedores, IVA y Caja."
          />
        </div>
      ) : (
        <>
          <div
            role="status"
            className={cn(
              'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
              failing.length === 0 ? 'border-success/25 bg-success-soft text-success' : 'border-danger/25 bg-danger-soft text-danger'
            )}
          >
            {failing.length === 0 ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <p>
              {failing.length === 0
                ? `Todo cuadra en ${period.label}: los ${checks.length} saldos del mayor coinciden con su fuente operativa.`
                : `${failing.length} de ${checks.length} cuadraturas no coinciden en ${period.label}. Revisa los asientos del período en el Libro Diario.`}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {checks.map((check) => (
              <article
                key={check.key}
                className={cn(
                  'rounded-xl border bg-card p-5 shadow-card',
                  check.inBalance ? 'border-border' : 'border-danger/40'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{check.label}</h2>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                      check.inBalance ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                    )}
                  >
                    {check.inBalance ? 'Cuadra' : 'Descuadre'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{SOURCE_DESCRIPTION[check.key]}</p>
                <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Fuente operativa</dt>
                    <dd className="font-medium">{formatCurrency(check.expected)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Libro mayor</dt>
                    <dd className="font-medium">{formatCurrency(check.actual)}</dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-border pt-1.5">
                    <dt className="text-muted-foreground">Diferencia</dt>
                    <dd className={cn('font-semibold', check.inBalance ? 'text-foreground' : 'text-danger')}>
                      {formatCurrency(check.difference)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <section className="rounded-xl border border-border bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">F29 de {period.label}</h2>
              <Link href="/dashboard/reports/f29" className="text-sm font-medium underline-offset-4 hover:underline">
                Ver formulario completo
              </Link>
            </div>
            <dl className="mt-3 grid gap-3 text-sm tabular-nums sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Débito fiscal</dt>
                <dd className="font-semibold">{formatCurrency(f29.debitVat)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Crédito fiscal</dt>
                <dd className="font-semibold">{formatCurrency(f29.creditVat)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">PPM</dt>
                <dd className="font-semibold">{formatCurrency(f29.ppmAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Impuesto determinado</dt>
                <dd className="font-semibold">{formatCurrency(f29.determinedTax)}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </div>
  );
}

import Link from 'next/link';
import { AlertOctagon, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Tone } from '@/components/ui/tone';
import { formatCurrency } from '@/lib/chile/tax';
import type { CashCycle } from '@/lib/intelligence/cash-cycle';
import { formatDays, formatPct, formatShortDate } from '@/lib/intelligence/format';
import { HEALTH_STATUS_LABEL, type HealthDimension, type HealthStatus } from '@/lib/intelligence/health-score';
import type { Insight, InsightSeverity } from '@/lib/intelligence/insights';
import { RFM_SEGMENT_META, type RfmSegment } from '@/lib/intelligence/rfm';
import { PRODUCT_QUADRANT_META, type Radiography } from '@/modules/intelligence/services/radiography.service';
import { cn } from '@/lib/utils';

export function SectionCard({ id, title, description, action, children, className }: { id?: string; title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('scroll-mt-24 rounded-lg border border-border bg-card p-5 shadow-card', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── Dimensiones de salud ────────────────────────────────────────────────────

const STATUS_TONE: Record<HealthStatus, Tone> = { good: 'success', fair: 'warning', poor: 'danger' };
const STATUS_BAR: Record<HealthStatus, string> = { good: 'var(--success)', fair: 'var(--warning)', poor: 'var(--danger)' };

export function HealthDimensions({ dimensions }: { dimensions: HealthDimension[] }) {
  return (
    <ul className="divide-y divide-border">
      {dimensions.map((dimension) => (
        <li key={dimension.key} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm font-medium text-foreground">{dimension.label}</p>
            <StatusBadge tone={STATUS_TONE[dimension.status]}>{HEALTH_STATUS_LABEL[dimension.status]}</StatusBadge>
            <p className="ml-auto text-xs tabular-nums text-muted-foreground">{dimension.valueLabel}</p>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div className="h-1.5 rounded-full" style={{ width: `${dimension.score}%`, backgroundColor: STATUS_BAR[dimension.status] }} />
            </div>
            <span className="w-8 text-right text-xs font-semibold tabular-nums text-foreground">{dimension.score}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Qué hacer: </span>
            {dimension.recommendation}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">{dimension.explanation}</p>
        </li>
      ))}
    </ul>
  );
}

// ── Señales ─────────────────────────────────────────────────────────────────

const SEVERITY_META: Record<InsightSeverity, { icon: LucideIcon; tone: string; bg: string; label: string }> = {
  critical: { icon: AlertOctagon, tone: 'text-danger', bg: 'bg-danger-soft', label: 'Crítico' },
  warning: { icon: AlertTriangle, tone: 'text-warning', bg: 'bg-warning-soft', label: 'Atención' },
  info: { icon: Info, tone: 'text-info', bg: 'bg-info-soft', label: 'Para saber' },
  positive: { icon: CheckCircle2, tone: 'text-success', bg: 'bg-success-soft', label: 'Buena noticia' },
};

export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <EmptyState
        title="Sin alertas por ahora"
        description="No detectamos riesgos relevantes en tus datos. Revisa esta sección cada semana: se recalcula en cada visita."
        icon={<CheckCircle2 className="size-10 text-success" strokeWidth={1.5} />}
        className="py-8"
      />
    );
  }
  return (
    <ul className="space-y-2.5">
      {insights.map((insight) => {
        const meta = SEVERITY_META[insight.severity];
        const Icon = meta.icon;
        return (
          <li key={insight.id} className="flex gap-3 rounded-md border border-border p-3">
            <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', meta.bg)}>
              <Icon className={cn('size-[18px]', meta.tone)} strokeWidth={1.75} aria-label={meta.label} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{insight.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{insight.detail}</p>
            </div>
            {insight.href && (
              <Link href={insight.href} className="flex shrink-0 items-center gap-1 self-center text-xs font-medium text-foreground hover:underline">
                Ver
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Ciclo de caja ───────────────────────────────────────────────────────────

/**
 * Línea de tiempo del ciclo de caja: inventario + cobro a la izquierda,
 * pago a proveedores descontando. Lo que queda es cuánto financia la propia
 * empresa.
 */
export function CashCycleVisual({ cycle }: { cycle: CashCycle }) {
  if (cycle.dso === null) {
    return <p className="text-sm text-muted-foreground">Se calcula cuando hay ventas en los últimos 90 días.</p>;
  }
  const dio = cycle.dio ?? 0;
  const dso = cycle.dso;
  const dpo = cycle.dpo ?? 0;
  const span = Math.max(dio + dso, dpo, 1);
  const pctOf = (value: number) => `${(value / span) * 100}%`;
  const ccc = cycle.ccc ?? 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex h-8 w-full overflow-hidden rounded-md bg-muted text-[11px] font-medium">
          {dio > 0 && (
            <div className="flex items-center justify-center bg-chart-4/80 text-white" style={{ width: pctOf(dio) }} title="Días de inventario">
              {dio}d
            </div>
          )}
          <div className="flex items-center justify-center bg-chart-2 text-white" style={{ width: pctOf(dso) }} title="Días de cobro">
            {dso}d
          </div>
        </div>
        <div className="flex h-8 w-full overflow-hidden rounded-md bg-muted text-[11px] font-medium">
          <div className="flex items-center justify-center bg-chart-3 text-white" style={{ width: pctOf(dpo) }} title="Días de pago">
            {dpo > 0 ? `${dpo}d` : ''}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Inventario (DIO)</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatDays(cycle.dio)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cobro (DSO)</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatDays(cycle.dso)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pago (DPO)</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatDays(cycle.dpo)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ciclo de caja</dt>
          <dd className={cn('font-semibold tabular-nums', ccc > 60 ? 'text-danger' : ccc > 30 ? 'text-warning' : 'text-success')}>{formatDays(cycle.ccc)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {ccc <= 0
          ? 'Tus proveedores financian tu operación: cobras antes de pagar. Es la posición más sana posible.'
          : `Cada venta inmoviliza caja durante ${formatDays(ccc)} entre que pagas a proveedores y cobras al cliente. Acortarlo libera caja sin vender un peso más.`}
      </p>
    </div>
  );
}

// ── Clientes ────────────────────────────────────────────────────────────────

const SEGMENT_ORDER: RfmSegment[] = ['CHAMPIONS', 'LOYAL', 'PROMISING', 'NEEDS_ATTENTION', 'AT_RISK', 'CANT_LOSE', 'HIBERNATING'];

export function CustomerSection({ customers }: { customers: Radiography['customers'] }) {
  if (customers.rows.length === 0) {
    return (
      <EmptyState
        title="Sin clientes identificados todavía"
        description="El análisis de cartera usa ventas con RUT de cliente. Las boletas a consumidor final se cuentan aparte."
        className="py-8"
      />
    );
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {SEGMENT_ORDER.map((segment) => {
          const meta = RFM_SEGMENT_META[segment];
          const summary = customers.segments[segment];
          return (
            <div key={segment} className={cn('rounded-md border border-border p-3', summary.count === 0 && 'opacity-55')} title={meta.action}>
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{summary.count}</p>
              <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(summary.monetary)}</p>
              <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">{meta.action}</p>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Principal cliente: <span className="font-semibold text-foreground">{formatPct(customers.topSharePct)}</span> de la venta
        </span>
        <span>
          Top 5: <span className="font-semibold text-foreground">{formatPct(customers.top5SharePct)}</span>
        </span>
        <span>
          Clientes A (80% de la venta): <span className="font-semibold text-foreground">{customers.abc.A.count}</span>
        </span>
        {customers.consumerSales > 0 && (
          <span>
            Consumidor final (sin RUT): <span className="font-semibold text-foreground">{formatCurrency(customers.consumerSales)}</span>
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Cliente</th>
              <th className="px-3 py-2 text-right font-medium">Venta 12 meses</th>
              <th className="px-3 py-2 text-right font-medium">Participación</th>
              <th className="px-3 py-2 text-center font-medium">ABC</th>
              <th className="px-3 py-2 text-right font-medium">Compras</th>
              <th className="px-3 py-2 text-right font-medium">Última compra</th>
              <th className="px-3 py-2 font-medium">Segmento</th>
            </tr>
          </thead>
          <tbody>
            {customers.rows.slice(0, 15).map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="max-w-[16rem] truncate px-3 py-2 font-medium text-foreground">{row.name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.netSales)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatPct(row.sharePct)}</td>
                <td className="px-3 py-2 text-center">
                  <AbcBadge value={row.abc} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.frequency}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">hace {formatDays(row.recencyDays)}</td>
                <td className="px-3 py-2">
                  <StatusBadge tone={RFM_SEGMENT_META[row.segment].tone}>{RFM_SEGMENT_META[row.segment].label}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AbcBadge({ value }: { value: 'A' | 'B' | 'C' }) {
  const tone: Tone = value === 'A' ? 'success' : value === 'B' ? 'info' : 'neutral';
  return <StatusBadge tone={tone}>{value}</StatusBadge>;
}

// ── Productos ───────────────────────────────────────────────────────────────

export function ProductSection({ products }: { products: Radiography['products'] }) {
  if (products.rows.length === 0 && products.stagnant.length === 0) {
    return <EmptyState title="Sin ventas de productos todavía" description="La matriz de productos aparece al emitir ventas con líneas de catálogo." className="py-8" />;
  }
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(PRODUCT_QUADRANT_META) as Array<keyof typeof PRODUCT_QUADRANT_META>).map((quadrant) => {
          const meta = PRODUCT_QUADRANT_META[quadrant];
          return (
            <div key={quadrant} className="rounded-md border border-border p-3">
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{products.quadrants[quadrant]}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{meta.description}</p>
            </div>
          );
        })}
      </div>

      {products.rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Venta neta</th>
                <th className="px-3 py-2 text-right font-medium">Utilidad</th>
                <th className="px-3 py-2 text-right font-medium">Margen</th>
                <th className="px-3 py-2 text-center font-medium">ABC</th>
                <th className="px-3 py-2 font-medium">Cuadrante</th>
              </tr>
            </thead>
            <tbody>
              {products.rows.slice(0, 15).map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="max-w-[18rem] px-3 py-2">
                    <p className="truncate font-medium text-foreground">{row.name}</p>
                    {row.sku && <p className="text-xs text-muted-foreground">{row.sku}</p>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.netSales)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', row.grossProfit < 0 && 'text-danger')}>{formatCurrency(row.grossProfit)}</td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', (row.marginPct ?? 0) < 0 ? 'text-danger' : 'text-muted-foreground')}>{formatPct(row.marginPct)}</td>
                  <td className="px-3 py-2 text-center">
                    <AbcBadge value={row.abc} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={PRODUCT_QUADRANT_META[row.quadrant].tone}>{PRODUCT_QUADRANT_META[row.quadrant].label}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {products.stagnant.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            Inventario sin rotación (90 días) · <span className="tabular-nums">{formatCurrency(products.stagnantValue)}</span> inmovilizados
          </p>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {products.stagnant.slice(0, 9).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.quantity.toLocaleString('es-CL')} u. · {row.lastSoldDaysAgo === null ? 'sin ventas en 12 meses' : `última venta hace ${formatDays(row.lastSoldDaysAgo)}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatCurrency(row.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Calendario tributario ───────────────────────────────────────────────────

export function TaxCalendar({ tax }: { tax: Radiography['tax'] }) {
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {tax.obligations.map((obligation) => {
          const urgent = obligation.daysLeft <= 5;
          return (
            <li key={obligation.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', urgent ? 'bg-warning-soft' : 'bg-muted')}>
                <CalendarClock className={cn('size-[18px]', urgent ? 'text-warning' : 'text-muted-foreground')} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{obligation.title}</p>
                <p className="truncate text-xs text-muted-foreground">{obligation.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">{formatShortDate(obligation.dueDate)}</p>
                <p className={cn('text-xs tabular-nums', urgent ? 'text-warning' : 'text-muted-foreground')}>
                  {obligation.daysLeft === 0 ? 'hoy' : `en ${formatDays(obligation.daysLeft)}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="rounded-md bg-muted/50 p-3">
        <p className="text-xs font-medium text-foreground">IVA y PPM estimados · {tax.vatPeriodLabel}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Débito fiscal</dt>
          <dd className="text-right tabular-nums">{formatCurrency(tax.debitVat)}</dd>
          <dt className="text-muted-foreground">Crédito fiscal</dt>
          <dd className="text-right tabular-nums">−{formatCurrency(tax.creditVat)}</dd>
          {tax.previousRemanent > 0 && (
            <>
              <dt className="text-muted-foreground">Remanente anterior</dt>
              <dd className="text-right tabular-nums">−{formatCurrency(tax.previousRemanent)}</dd>
            </>
          )}
          <dt className="text-muted-foreground">PPM</dt>
          <dd className="text-right tabular-nums">{formatCurrency(tax.ppm)}</dd>
          <dt className="font-medium text-foreground">A pagar (estimado)</dt>
          <dd className="text-right font-semibold tabular-nums text-foreground">{formatCurrency(tax.estimatedPayment)}</dd>
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground">Estimación sobre documentos emitidos. El cálculo oficial está en Formulario 29. Verifica fechas en sii.cl y previred.com.</p>
      </div>
    </div>
  );
}

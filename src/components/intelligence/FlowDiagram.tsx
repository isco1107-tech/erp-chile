import { ChevronRight, Gauge, Timer } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import { formatPct } from '@/lib/intelligence/format';
import type { BusinessFlow } from '@/lib/intelligence/process-flows';
import { cn } from '@/lib/utils';

/**
 * Un flujo de punta a punta dibujado como cadena de etapas. El ancho de la
 * barra bajo cada etapa es su volumen relativo a la primera: el "embudo" se
 * lee de un vistazo sin necesidad de un gráfico aparte.
 */
export function FlowDiagram({ flow }: { flow: BusinessFlow }) {
  const first = flow.stages[0]?.count ?? 0;

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{flow.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{flow.description}</p>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          {flow.highlights.map((highlight) => (
            <div key={highlight.label} className="text-right">
              <dt className="text-[11px] text-muted-foreground">{highlight.label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-foreground">{highlight.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {flow.stages.map((stage, index) => {
          const width = first > 0 ? Math.max(4, (stage.count / first) * 100) : 0;
          return (
            <li key={stage.key} className="flex flex-1 items-stretch gap-2 lg:min-w-0">
              <div className="flex-1 rounded-md border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">{stage.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{stage.count.toLocaleString('es-CL')}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(stage.amount)}</p>
                <div className="mt-3 h-1.5 rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-chart-2" style={{ width: `${width}%` }} />
                </div>
                {stage.conversionPct !== null && (
                  <p className={cn('mt-2 text-xs font-medium tabular-nums', stage.conversionPct < 50 ? 'text-warning' : 'text-success')}>
                    {formatPct(stage.conversionPct, 0)} de la etapa anterior
                  </p>
                )}
              </div>
              {index < flow.stages.length - 1 && (
                <ChevronRight className="hidden size-5 shrink-0 self-center text-muted-foreground/60 lg:block" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {flow.leadTimes.map((lt) => {
          const slow = lt.medianDays !== null && lt.medianDays > lt.targetDays;
          return (
            <div key={lt.key} className="flex items-start gap-3 rounded-md border border-border p-3">
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', slow ? 'bg-warning-soft' : 'bg-success-soft')}>
                <Timer className={cn('size-[18px]', slow ? 'text-warning' : 'text-success')} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{lt.label}</p>
                {lt.medianDays === null ? (
                  <p className="text-xs text-muted-foreground">Sin casos completados en la ventana analizada.</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Mediana <span className="font-semibold text-foreground tabular-nums">{lt.medianDays.toLocaleString('es-CL')} días</span>
                    {lt.p75Days !== null && <> · 1 de cada 4 tarda más de {lt.p75Days.toLocaleString('es-CL')} días</>} · referencia {lt.targetDays} días · {lt.sampleSize} casos
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {flow.bottleneck && (
        <div className="mt-4 flex items-start gap-3 rounded-md bg-warning-soft p-3">
          <Gauge className="mt-0.5 size-5 shrink-0 text-warning" strokeWidth={1.75} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-warning">Cuello de botella: {flow.bottleneck.label}</p>
            <p className="text-xs text-foreground">{flow.bottleneck.detail}</p>
          </div>
        </div>
      )}
    </section>
  );
}

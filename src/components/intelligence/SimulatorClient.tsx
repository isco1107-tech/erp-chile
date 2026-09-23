'use client';

import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/chile/tax';
import { formatPct, formatSignedPct } from '@/lib/intelligence/format';
import { NEUTRAL_LEVERS, simulate, type SimulatorBaseline, type SimulatorLevers } from '@/lib/intelligence/simulator';
import { cn } from '@/lib/utils';

interface LeverDefinition {
  key: keyof SimulatorLevers;
  label: string;
  hint: string;
  min: number;
  max: number;
  unit: '%' | 'días';
}

const LEVERS: LeverDefinition[] = [
  { key: 'pricePct', label: 'Precio de venta', hint: 'Subir o bajar tus precios', min: -20, max: 20, unit: '%' },
  { key: 'volumePct', label: 'Unidades vendidas', hint: 'Vender más o menos', min: -30, max: 30, unit: '%' },
  { key: 'unitCostPct', label: 'Costo de compra', hint: 'Negociar con proveedores o sufrir alzas', min: -20, max: 20, unit: '%' },
  { key: 'dsoDeltaDays', label: 'Días de cobro', hint: 'Negativo = cobrar más rápido', min: -30, max: 30, unit: 'días' },
  { key: 'dioDeltaDays', label: 'Días de inventario', hint: 'Negativo = menos stock inmovilizado', min: -45, max: 30, unit: 'días' },
  { key: 'dpoDeltaDays', label: 'Días de pago a proveedores', hint: 'Positivo = pagar más tarde', min: -30, max: 30, unit: 'días' },
];

function formatLever(value: number, unit: LeverDefinition['unit']): string {
  if (value === 0) return unit === '%' ? '0%' : '0 días';
  return unit === '%' ? `${value > 0 ? '+' : ''}${value}%` : `${value > 0 ? '+' : ''}${value} días`;
}

/**
 * Simulador "¿qué pasaría si…?" sobre la base real de 12 meses. Todo corre
 * en el navegador con `simulate()` (puro): mover una palanca no consulta al
 * servidor ni guarda nada.
 */
export function SimulatorClient({ baseline }: { baseline: SimulatorBaseline }) {
  const [levers, setLevers] = useState<SimulatorLevers>(NEUTRAL_LEVERS);
  const result = useMemo(() => simulate(baseline, levers), [baseline, levers]);
  const baseResult = useMemo(() => simulate(baseline, NEUTRAL_LEVERS), [baseline]);
  const touched = LEVERS.some((lever) => levers[lever.key] !== 0);

  if (baseline.netSales <= 0) {
    return <p className="text-sm text-muted-foreground">El simulador se activa cuando hay ventas emitidas en los últimos 12 meses.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        {LEVERS.map((lever) => {
          const value = levers[lever.key];
          const id = `lever-${lever.key}`;
          return (
            <div key={lever.key}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="text-sm font-medium text-foreground">
                  {lever.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{lever.hint}</span>
                </label>
                <span className={cn('text-sm font-semibold tabular-nums', value === 0 ? 'text-muted-foreground' : 'text-foreground')}>
                  {formatLever(value, lever.unit)}
                </span>
              </div>
              <input
                id={id}
                type="range"
                min={lever.min}
                max={lever.max}
                step={1}
                value={value}
                onChange={(event) => setLevers((prev) => ({ ...prev, [lever.key]: Number(event.target.value) }))}
                className="mt-2 w-full accent-primary"
              />
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={() => setLevers(NEUTRAL_LEVERS)} disabled={!touched}>
          <RotateCcw aria-hidden="true" />
          Volver a la base real
        </Button>
      </div>

      <div className="space-y-3 lg:col-span-2">
        <ResultRow label="Ventas netas anuales" value={formatCurrency(result.netSales)} delta={result.netSales - baseResult.netSales} />
        <ResultRow label="Utilidad bruta anual" value={formatCurrency(result.grossProfit)} delta={result.deltaGrossProfit} emphasis />
        <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
          <span className="text-sm text-muted-foreground">Margen bruto</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatPct(result.grossMarginPct)}
            {touched && baseResult.grossMarginPct !== null && result.grossMarginPct !== null && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">antes {formatPct(baseResult.grossMarginPct)}</span>
            )}
          </span>
        </div>
        <ResultRow label="Caja liberada por capital de trabajo" value={formatCurrency(result.cashFromWorkingCapital)} delta={result.cashFromWorkingCapital} hideDelta />
        {levers.pricePct !== 0 && result.breakEvenVolumePct !== null && (
          <p className="rounded-md bg-info-soft px-4 py-3 text-xs text-info">
            Con este precio necesitas vender {formatSignedPct(result.breakEvenVolumePct, 0)} unidades para mantener la misma utilidad bruta que hoy.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Base: ventas netas y costo PMP reales de los últimos 12 meses. No considera gastos fijos ni impuestos a la renta.
        </p>
      </div>
    </div>
  );
}

function ResultRow({ label, value, delta, emphasis, hideDelta }: { label: string; value: string; delta: number; emphasis?: boolean; hideDelta?: boolean }) {
  const tone = delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted-foreground';
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-md border px-4 py-3', emphasis ? 'border-primary/20 bg-accent' : 'border-border')}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className={cn('block font-semibold tabular-nums', emphasis ? 'text-lg text-foreground' : 'text-sm', hideDelta && tone)}>{value}</span>
        {!hideDelta && delta !== 0 && (
          <span className={cn('block text-xs font-medium tabular-nums', tone)}>
            {delta > 0 ? '+' : '−'}
            {formatCurrency(Math.abs(delta))}
          </span>
        )}
      </span>
    </div>
  );
}

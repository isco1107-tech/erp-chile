import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_SOFT_BG, TONE_TEXT, type Tone } from './tone';

export type TrendDirection = 'up' | 'down' | 'neutral';

const TREND_TONE: Record<TrendDirection, Tone> = {
  up: 'success',
  down: 'danger',
  neutral: 'neutral',
};

const TREND_ICON: Record<TrendDirection, LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  neutral: Minus,
};

export interface KpiCardProps {
  label: string;
  /** Slot opcional junto al label, ej. un <InfoTooltip /> explicando el término. */
  labelExtra?: ReactNode;
  value: string;
  icon: LucideIcon;
  /** Tono del cuadrado de ícono (fondo tintado 10-12%). Por defecto el acento de marca. */
  tone?: Tone;
  /** Ej. "+12.4%". Si se omite, no se muestra la fila de tendencia. */
  trend?: string;
  trendDirection?: TrendDirection;
  /** Texto muted junto a la píldora de tendencia. Por defecto "vs. periodo anterior". */
  hint?: string;
  className?: string;
}

/**
 * Tarjeta de indicador (KPI): label + ícono tintado arriba, cifra grande al
 * centro, píldora de tendencia semántica abajo. Ver brief sección 4.
 */
export function KpiCard({ label, labelExtra, value, icon: Icon, tone = 'accent', trend, trendDirection = 'neutral', hint = 'vs. periodo anterior', className }: KpiCardProps) {
  const TrendIcon = TREND_ICON[trendDirection];
  const trendTone = TREND_TONE[trendDirection];

  return (
    <article
      className={cn(
        'group rounded-lg border border-border bg-card p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-hover',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {label}
          {labelExtra}
        </p>
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', TONE_SOFT_BG[tone])}>
          <Icon className={cn('size-5', TONE_TEXT[tone])} strokeWidth={1.75} />
        </span>
      </div>

      <p className="mt-3 text-3xl font-bold tracking-[-0.02em] tabular-nums text-foreground">{value}</p>

      {trend && (
        <div className="mt-4 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              TONE_SOFT_BG[trendTone],
              TONE_TEXT[trendTone]
            )}
          >
            <TrendIcon className="size-3" strokeWidth={2} />
            {trend}
          </span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
      )}
    </article>
  );
}

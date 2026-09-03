import { cn } from '@/lib/utils';

export interface ProgressRowProps {
  label: string;
  /** 0-100. Se recorta al rango válido. */
  value: number;
  /** Color CSS del relleno (var(--chart-1), var(--success), etc). */
  color?: string;
  className?: string;
}

/** Fila label + barra delgada + porcentaje, para listas de participación (ej. mix de ventas por categoría). */
export function ProgressRow({ label, value, color = 'var(--chart-1)', className }: ProgressRowProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="w-28 shrink-0 truncate text-sm text-foreground">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full transition-[width] duration-150 ease-out"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

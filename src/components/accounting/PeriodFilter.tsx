import type { ReactNode } from 'react';
import { MONTH_LABELS, yearOptions, type AccountingPeriod } from './period';

/**
 * Filtro de período como formulario GET: el período queda en la URL (se
 * puede compartir, recargar o imprimir tal cual) y funciona sin JavaScript.
 * `children` permite sumar filtros propios de cada libro (p. ej. la cuenta
 * del Libro Mayor) dentro del mismo formulario.
 */
export function PeriodFilter({ period, children }: { period: AccountingPeriod; children?: ReactNode }) {
  const selectClass = 'h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground';
  return (
    <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
      {children}
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Mes
        <select name="month" defaultValue={period.month} className={selectClass}>
          {MONTH_LABELS.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Año
        <select name="year" defaultValue={period.year} className={selectClass}>
          {yearOptions().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="h-9 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/88"
      >
        Ver período
      </button>
    </form>
  );
}

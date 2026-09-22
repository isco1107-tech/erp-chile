/**
 * Utilidades de calendario en la zona horaria de negocio de Chile
 * (America/Santiago) — no la del servidor ni UTC.
 *
 * Por qué importa: Santiago va detrás de UTC (actualmente UTC-3; el offset
 * exacto varía según si ese año hay horario de verano). Construir límites de
 * "hoy" o "este mes" con `new Date(y, m, d)` (hora local del proceso) o con
 * `Date.UTC(y, m, d)` asume que la medianoche relevante es la del servidor o
 * la de UTC — pero para reportes que se muestran a alguien en Chile eso son
 * en realidad las 20:00–21:00 del día anterior. El síntoma real: cifras de
 * "ventas de hoy" o del mes en curso desfasadas cerca del cambio de día/mes.
 *
 * Se usa `Intl.DateTimeFormat` para resolver el offset vigente en vez de
 * asumirlo fijo (`UTC-3`/`UTC-4`), para no romper si Chile vuelve a cambiar
 * su política de horario de verano.
 */

/** Año, mes (1-12) y día calendario en Santiago para un instante dado. */
export function santiagoDateParts(date: Date): { year: number; month: number; day: number } {
  // 'en-CA' formatea como YYYY-MM-DD, cómodo de parsear sin ambigüedad de orden.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year, month, day] = formatted.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

/** Offset horario vigente de Santiago respecto a UTC, en horas (ej. -3). */
function santiagoOffsetHours(approx: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    timeZoneName: 'shortOffset',
  }).formatToParts(approx);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-3';
  const match = /GMT([+-]\d+)/.exec(raw);
  return match ? Number(match[1]) : -3;
}

/** Instante UTC correspondiente a la medianoche de un día calendario en Santiago. */
export function santiagoMidnightUtc(year: number, month: number, day: number): Date {
  // Aproximación inicial solo para resolver qué offset regía esa fecha
  // (puede diferir de "hoy" si se calculan meses pasados).
  const approx = new Date(Date.UTC(year, month - 1, day));
  const offsetHours = santiagoOffsetHours(approx);
  return new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0));
}

/** Medianoche de hoy en Santiago, como instante UTC. */
export function startOfTodaySantiago(now: Date = new Date()): Date {
  const { year, month, day } = santiagoDateParts(now);
  return santiagoMidnightUtc(year, month, day);
}

/** Medianoche de mañana en Santiago, como instante UTC (límite exclusivo de "hoy"). */
export function startOfTomorrowSantiago(now: Date = new Date()): Date {
  const { year, month, day } = santiagoDateParts(now);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return santiagoMidnightUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate());
}

/** Primer día del mes que contiene `date`, en el calendario de Santiago. */
export function startOfMonthSantiago(date: Date): Date {
  const { year, month } = santiagoDateParts(date);
  return santiagoMidnightUtc(year, month, 1);
}

/** `startOfMonthSantiago(date)` desplazado `offset` meses (puede ser negativo). */
export function addMonthsSantiago(date: Date, offset: number): Date {
  const { year, month } = santiagoDateParts(date);
  const total = year * 12 + (month - 1) + offset;
  return santiagoMidnightUtc(Math.floor(total / 12), (total % 12) + 1, 1);
}

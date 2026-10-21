import { santiagoDateParts, santiagoMidnightUtc } from '@/lib/chile/timezone';

/**
 * Calendario de las promociones. Dos reglas, para no correr un día:
 *  - "Hoy" se lee en America/Santiago (nunca en UTC ni en el huso del servidor).
 *  - El vencimiento de un lote es una fecha SIN hora: `parseExpiryDate`
 *    (lots.ts) la guarda a mediodía UTC, así que su día se lee con getters UTC.
 *    Un lote vence al terminar su día: el día del vencimiento aún se puede vender.
 * Ambos se llevan a un "índice de día" entero para restar sin ambigüedad.
 */

const MS_PER_DAY = 86_400_000;

function dayIndex(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** Día calendario de Santiago al que pertenece un instante, como índice de día. */
export function santiagoDayIndex(instant: Date): number {
  const { year, month, day } = santiagoDateParts(instant);
  return dayIndex(year, month, day);
}

/** Día calendario guardado en una fecha de vencimiento (lectura UTC), como índice de día. */
export function storedDayIndex(date: Date): number {
  return dayIndex(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** `YYYY-MM-DD` → índice de día, o `null` si no es una fecha real. */
export function parseDayIndex(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / MS_PER_DAY;
}

/** Días que faltan para el vencimiento (0 = vence hoy, negativo = vencido), en días de Santiago. */
export function daysUntilExpiry(expiresAt: Date, now: Date): number {
  return storedDayIndex(expiresAt) - santiagoDayIndex(now);
}

/**
 * Vigencia a partir de días calendario de Santiago: desde la medianoche de
 * `fromDay` hasta el FIN de `toDay` inclusive (medianoche del día siguiente,
 * como límite exclusivo). `toDay` null = sin fin. `null` si una fecha es inválida.
 */
export function dayWindow(fromDay: string, toDay: string | null): { startsAt: Date; endsAt: Date | null } | null {
  const from = parseDayIndex(fromDay);
  if (from === null) return null;
  const startsAt = santiagoMidnightUtc(...parts(from));
  if (toDay === null) return { startsAt, endsAt: null };
  const to = parseDayIndex(toDay);
  if (to === null || to < from) return null;
  return { startsAt, endsAt: santiagoMidnightUtc(...parts(to + 1)) };
}

function parts(index: number): [number, number, number] {
  const d = new Date(index * MS_PER_DAY);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

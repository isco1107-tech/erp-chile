/**
 * Lógica pura de la academia: meses adeudados y asistencia. Sin Prisma, para
 * poder probarla y usarla también desde el cliente.
 */

export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Presente',
  LATE: 'Atrasada',
  ABSENT: 'Ausente',
  JUSTIFIED: 'Justificada',
};

/** "2026-10" a partir de una fecha (se lee en UTC, como se guardan los días). */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Primer día del mes de `period`, a las 12:00 UTC. */
export function monthStart(period: string): Date {
  return new Date(`${period}-01T12:00:00Z`);
}

/** Meses de `from` a `to`, ambos incluidos ("YYYY-MM"). Vacío si `from` es posterior. */
export function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}

/** Meses que debe: desde su primer mes hasta el actual, menos los que ya pagó. */
export function pendingMonths(startMonth: Date, paidPeriods: readonly string[], now: Date): string[] {
  const paid = new Set(paidPeriods);
  return monthsBetween(monthKey(startMonth), monthKey(now)).filter((period) => !paid.has(period));
}

/**
 * % de asistencia: presentes y atrasadas sobre las clases que sí contaban.
 * Una ausencia justificada no cuenta contra la alumna (sale del total).
 * `null` si todavía no hay clases que medir.
 */
export function attendanceRate(statuses: readonly AttendanceStatus[]): number | null {
  const counted = statuses.filter((s) => s !== 'JUSTIFIED');
  if (counted.length === 0) return null;
  const attended = counted.filter((s) => s === 'PRESENT' || s === 'LATE').length;
  return Math.round((attended / counted.length) * 100);
}

/** Ausencias injustificadas seguidas contando desde la clase más reciente. */
export function consecutiveAbsences(statusesNewestFirst: readonly AttendanceStatus[]): number {
  let count = 0;
  for (const status of statusesNewestFirst) {
    if (status === 'ABSENT') count += 1;
    else if (status === 'JUSTIFIED') continue;
    else break;
  }
  return count;
}

/** Día "YYYY-MM-DD" → fecha guardada (12:00 UTC). */
export function dayToDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

/**
 * Lógica pura del calendario de la academia: grilla del mes (semana de lunes a
 * domingo, como se usa en Chile), semanas, horas y repetición semanal. Sin
 * Prisma ni zona horaria del navegador: los días son textos "YYYY-MM-DD" y las
 * cuentas se hacen en UTC para que un cambio de hora no corra ninguna fecha.
 */

const DAY_MS = 86_400_000;

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
export const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

/** Tope de clases que se crean de una vez con "repetir cada semana". */
export const MAX_SERIES_SESSIONS = 60;
/** Tope de días que se pide al calendario de una vez (6 semanas de la grilla + margen). */
export const MAX_RANGE_DAYS = 62;

function utcOf(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function isoOf(time: number): string {
  const d = new Date(time);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** `true` si es un día real del calendario ("2026-02-30" no lo es). */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isoOf(utcOf(value)) === value;
}

export function addDays(iso: string, days: number): string {
  return isoOf(utcOf(iso) + days * DAY_MS);
}

/** Días entre dos fechas (`to` - `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(iso: string): number {
  return (new Date(utcOf(iso)).getUTCDay() + 6) % 7;
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

/** Los 7 días (lunes a domingo) de la semana que contiene a `iso`. */
export function weekDays(iso: string): string[] {
  const monday = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function periodOf(iso: string): string {
  return iso.slice(0, 7);
}

export function lastDayOfMonth(period: string): number {
  return new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).getUTCDate();
}

/** "2026-10" desplazado `delta` meses (puede ser negativo). */
export function shiftMonth(period: string, delta: number): string {
  const total = Number(period.slice(0, 4)) * 12 + (Number(period.slice(5, 7)) - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export interface GridCell {
  iso: string;
  inMonth: boolean;
}

/** Semanas completas (lunes a domingo) que cubren el mes: 4 a 6 filas de 7 días. */
export function monthGrid(period: string): GridCell[][] {
  const first = `${period}-01`;
  const last = `${period}-${String(lastDayOfMonth(period)).padStart(2, '0')}`;
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const weeks: GridCell[][] = [];
  for (let day = start; day <= end; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(day, i);
      return { iso, inMonth: periodOf(iso) === period };
    }));
  }
  return weeks;
}

/** Primer y último día que muestra la grilla del mes (incluye los de meses vecinos). */
export function gridRange(period: string): { from: string; to: string } {
  const weeks = monthGrid(period);
  return { from: weeks[0]![0]!.iso, to: weeks[weeks.length - 1]![6]!.iso };
}

export function weekRange(iso: string): { from: string; to: string } {
  const days = weekDays(iso);
  return { from: days[0]!, to: days[6]! };
}

/** "octubre 2026". */
export function monthTitle(period: string): string {
  return `${MONTH_NAMES[Number(period.slice(5, 7)) - 1] ?? period} ${period.slice(0, 4)}`;
}

/** "sábado 11 de octubre". */
export function longDate(iso: string): string {
  return `${WEEKDAYS_LONG[weekdayIndex(iso)]} ${Number(iso.slice(8, 10))} de ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]}`;
}

/** "11 oct". */
export function shortDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]?.slice(0, 3)}`;
}

/** "13 – 19 de octubre" o "28 de septiembre – 4 de octubre" para el título de la vista semanal. */
export function weekTitle(iso: string): string {
  const { from, to } = weekRange(iso);
  const sameMonth = periodOf(from) === periodOf(to);
  const month = (d: string) => MONTH_NAMES[Number(d.slice(5, 7)) - 1];
  return sameMonth
    ? `${Number(from.slice(8, 10))} – ${Number(to.slice(8, 10))} de ${month(to)} ${to.slice(0, 4)}`
    : `${Number(from.slice(8, 10))} de ${month(from)} – ${Number(to.slice(8, 10))} de ${month(to)} ${to.slice(0, 4)}`;
}

// ── Horas ────────────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function timeToMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/** La clase debe terminar después de empezar. */
export function isValidTimeRange(start: string, end: string): boolean {
  return isTime(start) && isTime(end) && timeToMinutes(end) > timeToMinutes(start);
}

/** "10:00 – 12:00". */
export function timeRangeLabel(start: string, end: string): string {
  return `${start} – ${end}`;
}

/** "2 h", "1 h 30 min", "45 min". */
export function durationLabel(start: string, end: string): string {
  const total = timeToMinutes(end) - timeToMinutes(start);
  if (total <= 0) return '';
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export interface TimeBlock {
  /** % desde el borde superior de la franja horaria. */
  top: number;
  /** % de alto. */
  height: number;
}

export interface HourRange {
  /** Primera hora que se dibuja (0–23). */
  startHour: number;
  /** Hora en que termina la franja (1–24, exclusiva). */
  endHour: number;
}

const DEFAULT_HOUR_RANGE: HourRange = { startHour: 8, endHour: 21 };

/**
 * Franja horaria de la vista semanal: la de siempre (8 a 21 h) ampliada si hay
 * una clase más temprano o más tarde, para que ninguna quede fuera de la grilla.
 */
export function hourRangeFor(sessions: ReadonlyArray<{ startTime: string; endTime: string }>): HourRange {
  let startHour = DEFAULT_HOUR_RANGE.startHour;
  let endHour = DEFAULT_HOUR_RANGE.endHour;
  for (const s of sessions) {
    startHour = Math.min(startHour, Math.floor(timeToMinutes(s.startTime) / 60));
    endHour = Math.max(endHour, Math.ceil(timeToMinutes(s.endTime) / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, Math.max(endHour, startHour + 1)) };
}

/** Posición de una clase dentro de la franja horaria, en porcentaje. */
export function blockPosition(start: string, end: string, range: HourRange): TimeBlock {
  const from = range.startHour * 60;
  const span = (range.endHour - range.startHour) * 60;
  const top = ((timeToMinutes(start) - from) / span) * 100;
  const height = ((timeToMinutes(end) - timeToMinutes(start)) / span) * 100;
  return { top: Math.max(0, top), height: Math.max(0, Math.min(height, 100 - Math.max(0, top))) };
}

export interface Lane {
  /** Columna dentro del grupo de clases que se encima (0 = la primera). */
  lane: number;
  /** Cuántas columnas hay en ese grupo: el ancho de cada clase es 1/lanes. */
  lanes: number;
}

/**
 * Reparte en columnas las clases de un mismo día que se encima en el tiempo
 * (dos grupos a la misma hora), para dibujarlas lado a lado y que ninguna tape a
 * otra. Las que no se encima con nadie quedan a ancho completo.
 */
export function assignLanes<T extends { id: string; startTime: string; endTime: string }>(items: readonly T[]): Map<string, Lane> {
  const sorted = [...items].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || timeToMinutes(b.endTime) - timeToMinutes(a.endTime));
  const result = new Map<string, Lane>();
  let cluster: Array<{ id: string; lane: number }> = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = cluster.reduce((max, c) => Math.max(max, c.lane + 1), 1);
    for (const c of cluster) result.set(c.id, { lane: c.lane, lanes });
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    if (cluster.length > 0 && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}

// ── Repetición semanal ───────────────────────────────────────────────────────

export interface WeeklyRepeat {
  /** Cuántas semanas dura (la primera incluida). */
  weeks: number;
  /** Días de la semana (0 = lunes … 6 = domingo). Vacío = solo el día de `start`. */
  weekdays: readonly number[];
}

/**
 * Fechas de una clase que se repite cada semana, en orden. Parte en `start`
 * (que siempre se incluye, aunque su día no esté entre `weekdays`) y recorre
 * `weeks` semanas contando desde la de `start`. Se corta en `MAX_SERIES_SESSIONS`.
 */
export function expandWeekly(start: string, repeat: WeeklyRepeat | null | undefined): string[] {
  if (!repeat) return [start];
  const days = repeat.weekdays.length > 0 ? [...new Set(repeat.weekdays)] : [weekdayIndex(start)];
  const monday = startOfWeek(start);
  const dates = new Set<string>([start]);
  for (let week = 0; week < Math.max(1, repeat.weeks); week += 1) {
    for (const day of days) {
      const iso = addDays(monday, week * 7 + day);
      if (iso >= start) dates.add(iso);
    }
  }
  return [...dates].sort().slice(0, MAX_SERIES_SESSIONS);
}

// ── Estado de una clase ──────────────────────────────────────────────────────

/** Dónde cae un día respecto de hoy. */
export function dayRelation(iso: string, today: string): 'past' | 'today' | 'future' {
  if (iso < today) return 'past';
  return iso === today ? 'today' : 'future';
}

export interface AttendanceTally {
  /** Alumnas activas del grupo. */
  expected: number;
  /** Alumnas con una marca ese día. */
  marked: number;
}

export type RollState = 'cancelled' | 'done' | 'partial' | 'pending' | 'upcoming' | 'empty';

/**
 * Estado de la lista de una clase:
 * - `cancelled`: no se pasa lista.
 * - `upcoming`: aún no llega el día.
 * - `empty`: el grupo no tiene alumnas activas, no hay a quién marcar.
 * - `done` / `partial` / `pending`: lista completa, a medias o sin pasar.
 */
export function rollState(input: { isCancelled: boolean; date: string; today: string; tally: AttendanceTally }): RollState {
  if (input.isCancelled) return 'cancelled';
  if (input.date > input.today) return 'upcoming';
  if (input.tally.expected === 0) return 'empty';
  if (input.tally.marked === 0) return 'pending';
  return input.tally.marked >= input.tally.expected ? 'done' : 'partial';
}

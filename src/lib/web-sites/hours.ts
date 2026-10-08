import type { HoursDay } from './blocks';

/**
 * Horario de atención de la sección "Horario": agrupa los días con el mismo
 * horario ("Lunes a viernes · 09:00 – 18:00") y calcula "Abierto ahora" con la
 * hora de Chile, sin importar la zona horaria del navegador del visitante.
 * Puro: lo usan el renderizador (servidor y navegador) y las pruebas.
 *
 * Los días van de lunes (0) a domingo (6). Un tramo con cierre antes de la
 * apertura cruza la medianoche (un bar de 20:00 a 02:00).
 */

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function minutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface TimeRange {
  open: string;
  close: string;
}

/** Tramos válidos de un día (ambos extremos escritos y distintos). */
export function dayRanges(day: HoursDay | undefined): TimeRange[] {
  if (!day || day.closed) return [];
  const pairs: [string, string][] = [
    [day.open, day.close],
    [day.open2, day.close2],
  ];
  return pairs.filter(([open, close]) => TIME_RE.test(open) && TIME_RE.test(close) && open !== close).map(([open, close]) => ({ open, close }));
}

/** ¿El día tiene algo definido? (cerrado también cuenta: es un dato). */
export function isDayDefined(day: HoursDay | undefined): boolean {
  return Boolean(day && (day.closed || dayRanges(day).length > 0));
}

/** Horario de un día en palabras: "09:00 – 18:00", "09:00 – 13:00 · 15:00 – 19:00", "Cerrado" o `''` si no está definido. */
export function dayHoursText(day: HoursDay | undefined): string {
  if (!day) return '';
  if (day.closed) return 'Cerrado';
  return dayRanges(day)
    .map((range) => `${range.open} – ${range.close}`)
    .join(' · ');
}

export interface WeekGroup {
  /** Primer y último día del grupo (0 = lunes). */
  from: number;
  to: number;
  /** "Lunes a viernes", "Sábado". */
  label: string;
  /** "Lun – Vie", "Sáb". */
  short: string;
  /** Horario del grupo ("09:00 – 18:00" o "Cerrado"). */
  hours: string;
  closed: boolean;
}

/** Días seguidos con el mismo horario, en un solo renglón. Los días sin definir se omiten. */
export function groupWeek(week: HoursDay[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  for (let index = 0; index < 7; index += 1) {
    const day = week[index];
    const hours = dayHoursText(day);
    if (!hours) continue;
    const last = groups[groups.length - 1];
    if (last && last.to === index - 1 && last.hours === hours) {
      last.to = index;
      continue;
    }
    groups.push({ from: index, to: index, label: '', short: '', hours, closed: Boolean(day?.closed) });
  }
  return groups.map((group) => ({
    ...group,
    label: group.from === group.to ? DAY_NAMES[group.from]! : `${DAY_NAMES[group.from]} a ${DAY_NAMES[group.to]!.toLowerCase()}`,
    short: group.from === group.to ? DAY_SHORT[group.from]! : `${DAY_SHORT[group.from]} – ${DAY_SHORT[group.to]}`,
  }));
}

export function hasDefinedHours(week: HoursDay[]): boolean {
  return week.some((day) => dayRanges(day).length > 0);
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const CHILE_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Día (0 = lunes) y minuto del día en Chile para un instante dado. */
export function chileClock(date: Date): { day: number; minute: number } {
  const parts = Object.fromEntries(CHILE_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: WEEKDAY_INDEX[parts.weekday ?? 'Mon'] ?? 0, minute: Number(parts.hour ?? 0) * 60 + Number(parts.minute ?? 0) };
}

export interface HoursStatus {
  open: boolean;
  /** "Abierto ahora · cierra a las 18:00" / "Cerrado · abre mañana a las 09:00". */
  text: string;
}

/** Estado del local en un instante (hora de Chile); `null` si el horario no tiene ningún tramo. */
export function hoursStatus(week: HoursDay[], date: Date): HoursStatus | null {
  if (!hasDefinedHours(week)) return null;
  const { day, minute } = chileClock(date);

  // ¿Abierto? Un tramo de hoy que contiene la hora, o uno de ayer que cruzó la medianoche.
  for (const range of dayRanges(week[day])) {
    const open = minutes(range.open);
    const close = minutes(range.close);
    if (close > open ? minute >= open && minute < close : minute >= open) return { open: true, text: `Abierto ahora · cierra a las ${range.close}` };
  }
  const yesterday = (day + 6) % 7;
  for (const range of dayRanges(week[yesterday])) {
    const open = minutes(range.open);
    const close = minutes(range.close);
    if (close < open && minute < close) return { open: true, text: `Abierto ahora · cierra a las ${range.close}` };
  }

  // Cerrado: la próxima apertura, hoy más tarde o en los días siguientes.
  const laterToday = dayRanges(week[day])
    .filter((range) => minutes(range.open) > minute)
    .sort((a, b) => minutes(a.open) - minutes(b.open))[0];
  if (laterToday) return { open: false, text: `Cerrado · abre hoy a las ${laterToday.open}` };
  for (let offset = 1; offset <= 7; offset += 1) {
    const next = (day + offset) % 7;
    const first = dayRanges(week[next]).sort((a, b) => minutes(a.open) - minutes(b.open))[0];
    if (!first) continue;
    const when = offset === 1 ? 'mañana' : `el ${DAY_NAMES[next]!.toLowerCase()}`;
    return { open: false, text: `Cerrado · abre ${when} a las ${first.open}` };
  }
  return { open: false, text: 'Cerrado' };
}

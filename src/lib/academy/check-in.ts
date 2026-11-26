/**
 * Registro de asistencia con QR (lógica pura, sin Prisma).
 *
 * La profesora abre una ventana de registro para un grupo y el día de HOY;
 * el QR lleva a `/academia/asistencia/[token]`, donde la alumna escribe su
 * RUT y queda «Presente». Reglas:
 *  - el QR solo sirve el día de la clase (día de Santiago, lo decide el
 *    servidor) y vence a la hora elegida, nunca después de la medianoche;
 *  - solo llena una marca VACÍA: lo que ya marcó la profesora no se cambia;
 *  - desde la hora que elige la profesora (`lateAfter`), queda «Atrasada»;
 *  - a la alumna solo se le muestra su primer nombre.
 */

import { cleanRut } from '@/lib/chile/rut';
import { santiagoDateParts, startOfTomorrowSantiago } from '@/lib/chile/timezone';
import type { AttendanceStatus } from './billing';
import { isTime, timeToMinutes } from './calendar';

/** 24 bytes aleatorios en hexadecimal. */
export const CHECK_IN_TOKEN_BYTES = 24;
export const CHECK_IN_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

/** Cuánto queda abierto el registro (minutos). Lista cerrada: la valida el servidor. */
export const CHECK_IN_DURATIONS = [15, 30, 60, 120, 180] as const;
export type CheckInDuration = (typeof CHECK_IN_DURATIONS)[number];
export const DEFAULT_CHECK_IN_MINUTES: CheckInDuration = 60;

export const CHECK_IN_DURATION_LABELS: Record<CheckInDuration, string> = {
  15: '15 minutos',
  30: '30 minutos',
  60: '1 hora',
  120: '2 horas',
  180: '3 horas',
};

export function isCheckInDuration(value: unknown): value is CheckInDuration {
  return typeof value === 'number' && (CHECK_IN_DURATIONS as readonly number[]).includes(value);
}

/** "YYYY-MM-DD" del día en curso en Santiago (el servidor corre en UTC). */
export function santiagoIsoDay(now: Date): string {
  const { year, month, day } = santiagoDateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Vence a los `minutes` minutos, pero nunca pasada la medianoche de Santiago: el QR es de la clase de hoy. */
export function checkInExpiry(now: Date, minutes: CheckInDuration): Date {
  const wanted = now.getTime() + minutes * 60_000;
  const endOfDay = startOfTomorrowSantiago(now).getTime() - 1000;
  return new Date(Math.min(wanted, endOfDay));
}

export type CheckInState = 'OPEN' | 'EXPIRED' | 'CLOSED';

export function checkInState(link: { expiresAt: Date; closedAt: Date | null }, now: Date): CheckInState {
  if (link.closedAt) return 'CLOSED';
  return link.expiresAt.getTime() > now.getTime() ? 'OPEN' : 'EXPIRED';
}

/**
 * Qué pasa cuando la alumna escribe su RUT y ya existe (o no) una marca:
 *  - `CREATE`: no tenía marca → queda «Presente»;
 *  - `ALREADY_PRESENT`: ya estaba presente o atrasada → no cambia nada;
 *  - `MARKED_BY_TEACHER`: la profesora la marcó ausente o justificada → no se
 *    pisa, se avisa a la alumna que hable con ella (y en la lista se ve que se
 *    registró con el QR).
 */
export type CheckInDecision = 'CREATE' | 'ALREADY_PRESENT' | 'MARKED_BY_TEACHER';

export function decideCheckIn(existing: AttendanceStatus | null): CheckInDecision {
  if (existing === null) return 'CREATE';
  if (existing === 'PRESENT' || existing === 'LATE') return 'ALREADY_PRESENT';
  return 'MARKED_BY_TEACHER';
}

/**
 * Formas en que puede estar guardado un RUT limpio: tal cual y sin ceros a la
 * izquierda (quien escribe «09.876.543-2» es la misma persona que «9.876.543-2»).
 */
export function rutLookupKeys(rut: string): string[] {
  const clean = cleanRut(rut);
  const trimmed = clean.replace(/^0+/, '');
  return [...new Set([clean, trimmed].filter((value) => value.length >= 2))];
}

/** Solo el primer nombre: confirma a la alumna que es ella sin mostrar su nombre completo a quien tenga el QR. */
export function firstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.slice(0, 40);
}

/** Minutos desde la medianoche, en la hora de Santiago. */
export function santiagoMinutesOfDay(date: Date): number {
  return timeToMinutes(santiagoTimeLabel(date));
}

/**
 * Con qué estado queda quien escanea: «Atrasada» desde la hora elegida por la
 * profesora (esa hora incluida: «desde las 10:10» y escanear a las 10:10 es
 * atraso) y «Presente» antes. Sin hora (o una hora mal formada), siempre presente.
 */
export function checkInStatus(now: Date, lateAfter: string | null): 'PRESENT' | 'LATE' {
  if (!lateAfter || !isTime(lateAfter)) return 'PRESENT';
  return santiagoMinutesOfDay(now) >= timeToMinutes(lateAfter) ? 'LATE' : 'PRESENT';
}

/** Lo que vuelve la página pública después de escribir el RUT. */
export type CheckInOutcome =
  | { kind: 'CREATED'; firstName: string; at: string; status: 'PRESENT' | 'LATE' }
  | { kind: 'ALREADY_PRESENT'; firstName: string }
  | { kind: 'MARKED_BY_TEACHER'; firstName: string }
  | { kind: 'NOT_FOUND' }
  | { kind: 'CLOSED' }
  | { kind: 'CANCELLED' };

/** Hora "HH:MM" de Santiago, armada con dígitos (mismo cuidado que `clockLabel`). */
export function santiagoTimeLabel(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.hour ?? '00'}:${parts.minute ?? '00'}`;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-11-26" → "jueves 26 de noviembre". Sin `toLocaleDateString`, para que servidor y navegador escriban lo mismo. */
export function classDayLabel(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDay;
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]}`;
}

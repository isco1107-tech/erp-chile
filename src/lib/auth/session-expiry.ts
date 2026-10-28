/**
 * Aviso de cierre de sesión (la sesión dura 8 horas fijas, ver `session.ts`).
 * Puro: decide cuándo avisar y cuándo dar la sesión por terminada, para que
 * nadie pierda lo que está escribiendo sin saber por qué.
 */

/** Minutos de anticipación del aviso. */
export const SESSION_WARNING_MINUTES = 10;

export interface SessionExpiryPlan {
  /** Milisegundos hasta el aviso (0 = avisar ya). */
  warnInMs: number;
  /** Milisegundos hasta el cierre (0 = ya cerró). */
  expireInMs: number;
}

export function sessionExpiryPlan(expiresAtMs: number, nowMs: number): SessionExpiryPlan {
  const expireInMs = Math.max(0, expiresAtMs - nowMs);
  const warnInMs = Math.max(0, expireInMs - SESSION_WARNING_MINUTES * 60_000);
  return { warnInMs, expireInMs };
}

/** `17:05` en hora de Chile, igual en Node y en el navegador (sin «p. m.»). */
export function santiagoClock(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: 'hour' | 'minute') => parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('hour')}:${pick('minute')}`;
}

import { createHash, randomInt } from 'node:crypto';

/**
 * Reglas (puras) de las órdenes `empresa.reiniciar.*` y `empresa.eliminar.*` de
 * la Supersuite: el código de un solo uso, cuándo se puede confirmar y cuándo
 * vence. El servicio (`company-erasure.service.ts`) las aplica sobre la base.
 *
 * Borrar es irreversible, así que cada orden va en DOS pasos: la solicitud
 * cuenta lo que se borraría y entrega un código; la confirmación lo trae junto
 * con la razón social escrita. Eliminar la empresa además exige una espera.
 */

export type ErasureKind = 'RESET' | 'DELETE';
export type ErasureStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'CANCELLED';

/** Reiniciar: el código vale 30 minutos desde que se pide. */
export const RESET_CODE_MINUTES = 30;
/** Eliminar: no se puede confirmar antes de 7 días… */
export const DELETE_WAIT_DAYS = 7;
/** …y la ventana para confirmarla dura otros 7 días: después hay que pedirla de nuevo. */
export const DELETE_CONFIRM_DAYS = 7;
/** Códigos equivocados que tolera una solicitud antes de cancelarse. */
export const MAX_CODE_ATTEMPTS = 5;
/** Una ejecución «en curso» que lleva más que esto se da por muerta (la función cayó) y se puede retomar. */
export const RUNNING_STALE_MS = 15 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sin 0/O/1/I/L: el código se dicta o se copia a mano. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

/** `ABCDE-FGHJK`: 10 símbolos de 31 (~49 bits). Solo viaja en la respuesta de la solicitud. */
export function newErasureCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Mayúsculas y sin guiones ni espacios: «abcde fghjk» y «ABCDE-FGHJK» son el mismo código. */
export function normalizeErasureCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** En la base solo vive el SHA-256 del código normalizado. */
export function hashErasureCode(code: string): string {
  return createHash('sha256').update(normalizeErasureCode(code)).digest('hex');
}

export function erasureWindow(kind: ErasureKind, now: Date): { notBefore: Date; expiresAt: Date } {
  if (kind === 'RESET') return { notBefore: now, expiresAt: new Date(now.getTime() + RESET_CODE_MINUTES * 60_000) };
  const notBefore = new Date(now.getTime() + DELETE_WAIT_DAYS * DAY_MS);
  return { notBefore, expiresAt: new Date(notBefore.getTime() + DELETE_CONFIRM_DAYS * DAY_MS) };
}

export interface ErasureRequestState {
  status: ErasureStatus;
  notBefore: Date;
  expiresAt: Date;
  startedAt: Date | null;
}

export type ConfirmationCheck =
  | { ok: true }
  | { ok: false; reason: 'DONE' | 'CANCELLED' | 'RUNNING' | 'NOT_YET' | 'EXPIRED' };

/** ¿Se puede ejecutar esta solicitud ahora? `DONE` no es un error: es una orden reentregada. */
export function checkConfirmation(request: ErasureRequestState, now: Date): ConfirmationCheck {
  if (request.status === 'DONE') return { ok: false, reason: 'DONE' };
  if (request.status === 'CANCELLED') return { ok: false, reason: 'CANCELLED' };
  if (request.status === 'RUNNING' && request.startedAt && now.getTime() - request.startedAt.getTime() < RUNNING_STALE_MS) {
    return { ok: false, reason: 'RUNNING' };
  }
  if (now.getTime() < request.notBefore.getTime()) return { ok: false, reason: 'NOT_YET' };
  if (now.getTime() > request.expiresAt.getTime()) return { ok: false, reason: 'EXPIRED' };
  return { ok: true };
}

/** «lunes 2 de noviembre de 2026, 14:30» en hora de Chile, para los mensajes que lee una persona. */
export function whenLabel(date: Date): string {
  return date.toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

import type { DataSubjectRequestStatus } from '@prisma/client';
import { REQUEST_DUE_SOON_DAYS, REQUEST_EXTENSION_DAYS, REQUEST_RESPONSE_DAYS } from './constants';

/**
 * Plazos de las solicitudes de derechos del titular. Todo en días corridos y
 * sobre fechas UTC: un día más o menos de diferencia por zona horaria no
 * cambia el cumplimiento de un plazo de 30 días, y evita que el cálculo
 * dependa de dónde corra el servidor.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Fecha límite de respuesta contada desde que la empresa recibió la solicitud. */
export function computeDueDate(receivedAt: Date): Date {
  return addDays(receivedAt, REQUEST_RESPONSE_DAYS);
}

/** Último día al que se puede prorrogar una solicitud recibida en `receivedAt`. */
export function maxExtensionDate(receivedAt: Date): Date {
  return addDays(computeDueDate(receivedAt), REQUEST_EXTENSION_DAYS);
}

export interface DeadlineInput {
  status: DataSubjectRequestStatus;
  receivedAt: Date;
  dueAt: Date;
  extendedUntil: Date | null;
}

export type DeadlineState =
  | { kind: 'CLOSED' }
  | { kind: 'ON_TIME'; daysLeft: number }
  | { kind: 'DUE_SOON'; daysLeft: number }
  | { kind: 'OVERDUE'; daysOverdue: number };

/** Fecha que rige hoy: la prórroga si existe, si no la original. */
export function effectiveDueDate(input: Pick<DeadlineInput, 'dueAt' | 'extendedUntil'>): Date {
  return input.extendedUntil && input.extendedUntil.getTime() > input.dueAt.getTime() ? input.extendedUntil : input.dueAt;
}

export function deadlineState(input: DeadlineInput, now: Date = new Date()): DeadlineState {
  if (input.status === 'RESOLVED' || input.status === 'REJECTED') return { kind: 'CLOSED' };
  const remainingMs = effectiveDueDate(input).getTime() - now.getTime();
  const days = Math.ceil(remainingMs / DAY_MS);
  if (remainingMs < 0) return { kind: 'OVERDUE', daysOverdue: Math.max(1, Math.ceil(-remainingMs / DAY_MS)) };
  return days <= REQUEST_DUE_SOON_DAYS ? { kind: 'DUE_SOON', daysLeft: days } : { kind: 'ON_TIME', daysLeft: days };
}

/**
 * Valida una prórroga: debe ser posterior al plazo vigente, no pasar del
 * máximo y traer motivo. Devuelve el mensaje de error o `null` si es válida.
 */
export function extensionProblem(input: { receivedAt: Date; dueAt: Date; requestedUntil: Date; reason: string }): string | null {
  if (input.reason.trim().length < 10) return 'Explica el motivo de la prórroga (mínimo 10 caracteres)';
  if (input.requestedUntil.getTime() <= input.dueAt.getTime()) return 'La prórroga debe ser posterior al plazo actual';
  if (input.requestedUntil.getTime() > maxExtensionDate(input.receivedAt).getTime()) {
    return `La prórroga no puede superar ${REQUEST_EXTENSION_DAYS} días adicionales al plazo original`;
  }
  return null;
}

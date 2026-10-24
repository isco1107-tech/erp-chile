import crypto from 'crypto';
import { z } from 'zod';

/**
 * Seller Center: cuentas por persona de un seller de consignación (`/proveedor/cuenta`).
 * Funciones puras y constantes compartidas por el servidor y los formularios.
 *
 * Reglas:
 * - Los enlaces (invitación, recuperación) son 32 bytes al azar; en la base solo
 *   queda su SHA-256 y sirven una sola vez.
 * - El correo se guarda en minúsculas y sin espacios: es la identidad de la persona
 *   en toda la plataforma.
 */

export const INVITE_TTL_DAYS = 7;
export const RESET_TTL_MINUTES = 60;
/** Intentos fallidos seguidos antes de bloquear el ingreso, y por cuánto. */
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
/** Duración máxima de una sesión del Seller Center (igual que la del panel). */
export const SESSION_HOURS = 8;
export const SUPPLIER_SESSION_COOKIE = 'supplier_session';

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const accountEmailSchema = z
  .string()
  .trim()
  .max(254, 'El correo es demasiado largo')
  .email('Escribe un correo válido')
  .transform(normalizeEmail);

/** Enlace de un solo uso: el valor en claro va en el correo; se guarda solo su huella. */
export function newAccountToken(random: (size: number) => Uint8Array = crypto.randomBytes): string {
  return Buffer.from(random(32)).toString('base64url');
}

export function hashAccountToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Un token con forma válida (43 caracteres base64url). Lo demás ni se busca en la base. */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// ─── Períodos (meses de Santiago) ────────────────────────────────────────────

/** `YYYY-MM` válido entre 2000 y 2100. */
export function isMonthKey(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return false;
  const [y, m] = value.split('-').map(Number) as [number, number];
  return y >= 2000 && y <= 2100 && m >= 1 && m <= 12;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Los últimos `count` meses hasta `current` (el más reciente primero). */
export function recentMonths(current: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(current, -i));
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

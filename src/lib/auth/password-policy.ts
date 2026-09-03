import { z } from 'zod';

/**
 * Estándar de contraseña único para todo el proyecto: creación directa por un
 * administrador, aceptar invitación, recuperación y el cambio forzado de
 * primer ingreso comparten exactamente esta regla. Antes cada flujo repetía
 * su propio `z.string().min(8)` por separado — bastaba con no actualizar uno
 * para que la política divergiera sin que nadie lo notara.
 *
 * Sin dependencias de servidor a propósito: el formulario de cliente importa
 * el mismo schema para validar en vivo, no una copia.
 */

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS: string[] = [
  `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
  'Al menos una letra mayúscula',
  'Al menos una letra minúscula',
  'Al menos un número',
];

export const passwordPolicySchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
  .regex(/[A-Z]/, 'La contraseña debe incluir al menos una letra mayúscula')
  .regex(/[a-z]/, 'La contraseña debe incluir al menos una letra minúscula')
  .regex(/[0-9]/, 'La contraseña debe incluir al menos un número');

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I/O: se confunden con 1/0 al transcribir a mano
const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // sin l/o por la misma razón
const DIGITS = '23456789'; // sin 0/1
const ALL = UPPER + LOWER + DIGITS;

function randomChar(charset: string): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return charset[bytes[0]! % charset.length]!;
}

function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars;
}

/**
 * Genera una contraseña temporal que cumple `passwordPolicySchema` por
 * construcción (garantiza al menos un carácter de cada clase requerida) y
 * evita caracteres ambiguos (I/l/1, O/0) porque el administrador la va a
 * transcribir a mano — por WhatsApp, en persona, por teléfono — no copiarla
 * de un correo. Formato `Xxxx-Xxxx-Xxxx`: 12 caracteres, fácil de dictar.
 */
export function generateRandomPassword(): string {
  const required = [randomChar(UPPER), randomChar(LOWER), randomChar(DIGITS)];
  const rest = Array.from({ length: 9 }, () => randomChar(ALL));
  const chars = shuffle([...required, ...rest]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

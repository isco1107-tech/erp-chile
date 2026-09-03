import { z } from 'zod';

/**
 * Teléfono personal de un usuario (`User.phone`). Formato exigido: E.164
 * simple, código de país incluido (`+56912345678`). Es el mismo string que
 * alimenta el link de WhatsApp (`wa.me/<dígitos>`), así que validar el
 * formato acá evita generar un link roto más adelante.
 */
const PHONE_REGEX = /^\+\d{8,15}$/;

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

/** Dígitos sin el `+`, tal como los espera `https://wa.me/<dígitos>`. */
export function toWhatsappDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Compartido entre cliente y servidor (validación simétrica): vacío se
 * acepta acá y se normaliza a `null` en la Server Action, no en el schema.
 */
export const phoneSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || isValidPhone(v), 'Formato inválido. Usa código de país, ej: +56912345678');

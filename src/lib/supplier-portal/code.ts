import crypto from 'crypto';

/**
 * Código de acceso de un proveedor a su portal de inventario (`/proveedor`).
 *
 * Es un código que una persona escribe o recibe por WhatsApp, no un enlace
 * largo: 16 símbolos del alfabeto de Crockford (sin I, L, O ni U, que se
 * confunden con 1, 0 y V), agrupados de a cuatro: `K7QM-4TXD-9HWB-2ZNC`. Son 80 bits
 * al azar — inviable de adivinar aunque se pruebe sin parar — y en la base solo se
 * guarda su SHA-256, así que una copia de la base no entrega códigos utilizables.
 */

import { SUPPLIER_CODE_ALPHABET, SUPPLIER_CODE_LENGTH, formatSupplierCode, normalizeSupplierCode } from './format';

export { SUPPLIER_CODE_LENGTH, formatSupplierCode, normalizeSupplierCode };

/** Código nuevo, al azar. 10 bytes = 80 bits = 16 símbolos de 5 bits, sin sesgo. */
export function newSupplierCode(random: (size: number) => Uint8Array = crypto.randomBytes): string {
  const bytes = random(10);
  let buffer = 0;
  let bits = 0;
  let code = '';
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      code += SUPPLIER_CODE_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return code;
}

/** Huella con la que se guarda y se busca el código. Con prefijo propio: no se confunde con otros tokens. */
export function hashSupplierCode(normalized: string): string {
  return crypto.createHash('sha256').update(`supplier-portal:${normalized}`).digest('hex');
}

/** Últimos símbolos, para reconocer el código en pantalla sin revelarlo (`…2ZNC`). */
export function supplierCodeHint(normalized: string): string {
  return normalized.slice(-4);
}

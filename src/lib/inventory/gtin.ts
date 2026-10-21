/**
 * Códigos GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) con su dígito verificador GS1.
 * Puro y sin dependencias: lo usan la lectura de fotos de producto y cualquier
 * flujo que quiera rechazar un código mal leído antes de guardarlo.
 */

const VALID_LENGTHS = [8, 12, 13, 14] as const;

/** Deja solo dígitos (quita espacios, guiones y puntos que el OCR suele intercalar). */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** `true` si el código tiene un largo GTIN y su último dígito es el verificador correcto (módulo 10 GS1). */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  if (!(VALID_LENGTHS as readonly number[]).includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  // Pesos 3,1,3,1... empezando por el dígito más cercano al verificador.
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += digits[i]! * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Formas equivalentes de un mismo código: un UPC-A de 12 dígitos es un EAN-13
 * con un 0 delante, y un GTIN-14 con 0 inicial es el EAN-13. Sirve para
 * detectar duplicados aunque el catálogo lo tenga guardado con otro largo.
 */
export function gtinVariants(code: string): string[] {
  const variants = new Set<string>([code]);
  if (code.length === 12 || code.length === 13) variants.add(`0${code}`);
  if (code.length === 13 && code.startsWith('0')) variants.add(code.slice(1));
  if (code.length === 14 && code.startsWith('0')) {
    variants.add(code.slice(1));
    if (code.slice(1).startsWith('0')) variants.add(code.slice(2));
  }
  return [...variants];
}

/**
 * Códigos que lee la app del bodeguero (cámara o lector): normalización y
 * validación. Puro, sin dependencias de servidor ni de navegador, para que lo
 * usen el celular (al decidir si un código leído es creíble) y el servidor (al
 * buscar el producto).
 */

/** Largos de un GTIN: EAN-8, UPC-A (12), EAN-13 y GTIN-14 (cajas). */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** Máximo de caracteres que se acepta de un código leído (igual que `Product.barcode`). */
export const MAX_CODE_LENGTH = 64;

/**
 * Deja el código como lo guardaría un lector: sin espacios a los lados, sin
 * caracteres de control y sin saltos de línea (algunos lectores agregan un
 * Enter al final). No cambia mayúsculas: el código de barras de un producto
 * se guarda tal cual, y buscar por SKU ya ignora mayúsculas en la consulta.
 */
export function normalizeScannedCode(raw: string): string {
  let code = '';
  for (const char of raw) {
    const point = char.codePointAt(0) ?? 0;
    if (point > 0x20 && point !== 0x7f) code += char;
  }
  return code.slice(0, MAX_CODE_LENGTH);
}

/** Dígito verificador GS1 (módulo 10) de los primeros n-1 dígitos. */
function gtinCheckDigit(payload: string): number {
  let sum = 0;
  // Se pesa de derecha a izquierda: 3, 1, 3, 1...
  for (let i = payload.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(payload[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** `true` si es un GTIN (EAN-8, UPC-A, EAN-13 o GTIN-14) con el dígito verificador correcto. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || !GTIN_LENGTHS.has(code.length)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/**
 * Formas equivalentes de un mismo código para buscarlo en el catálogo: un
 * UPC-A de 12 dígitos es un EAN-13 con un cero adelante, y muchos lectores y
 * planillas pierden ese cero (o lo agregan). El código original va primero.
 */
export function codeVariants(raw: string): string[] {
  const code = normalizeScannedCode(raw);
  if (!code) return [];
  const variants = [code];
  if (/^\d+$/.test(code)) {
    if (code.length === 12) variants.push(`0${code}`);
    if (code.length === 13 && code.startsWith('0')) variants.push(code.slice(1));
    if (code.length === 14 && code.startsWith('0')) variants.push(code.slice(1));
  }
  return [...new Set(variants)];
}

/**
 * ¿Merece buscar este texto como código y no como nombre? Un GTIN válido o un
 * código corto alfanumérico sin espacios (SKU interno, Code 128) sí; una frase
 * no. Sirve para decidir, en el buscador del celular, si se prueba primero la
 * búsqueda exacta por código.
 */
export function looksLikeCode(text: string): boolean {
  const code = normalizeScannedCode(text);
  if (code.length < 3 || code.length !== text.trim().length) return false;
  if (isValidGtin(code)) return true;
  return /^[A-Za-z0-9._\-/]{3,40}$/.test(code) && /\d/.test(code);
}

/**
 * Código que la IA dice haber leído en la etiqueta: se descarta si no es un
 * GTIN con dígito verificador válido. Un modelo puede equivocar un dígito, y
 * un código mal leído NUNCA debe llevar a otro producto ni guardarse como el
 * código de barras de uno nuevo.
 */
export function trustedGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s.-]/g, '');
  return isValidGtin(digits) ? digits : null;
}
